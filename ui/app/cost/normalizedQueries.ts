import { UNASSIGNED } from "./queries";

/**
 * Billable usage of "Traces - Ingest & Process" and "Metrics - Ingest & Process".
 *
 * Both capabilities include volumes that are covered by Full-Stack / Infrastructure Monitoring,
 * so the raw events overstate billable usage. The normalization below is ported from the
 * "DPS Cost Allocation Overview Dashboard v3.11" (traces: included fullstack volume per 15 min,
 * metrics: included data points per host-hour) and attributed by dt.cost.costcenter.
 *
 * Returns one record per capability, period ("current" | "previous"), cost center and time bucket.
 * Traces usage is in GiB, metrics usage in data points.
 */
export interface NormalizedRecord {
  capability: string;
  period: "current" | "previous";
  costcenter: string;
  bucket: string;
  usage: number;
}

const tracesIngest = (from: string, to: string) => `fetch dt.system.events, from: toTimestamp("${from}") - 1h, to: toTimestamp("${to}") + 1h
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Traces - Ingest & Process"
| fieldsAdd costallocation = dt.cost.costcenter
| fieldsRemove dt.cost.costcenter, dt.cost.product
| fieldsAdd costallocation = if(isNull(costallocation), "${UNASSIGNED}", else: costallocation)
| fieldsKeep usage.start, licensing_type, ingested_bytes, costallocation, event.id
| dedup event.id
| fieldsAdd licensing_type = if(in(licensing_type, {"otlp-trace-ingest", "serverless"}), "other", else: licensing_type)
| fieldsAdd adaptive_volume = if(licensing_type == "fullstack-adaptive", ingested_bytes)
| fieldsAdd fixed_rate_volume = if(licensing_type == "fullstack-fixed-rate", ingested_bytes)
| fieldsAdd other_volume = if(licensing_type == "other", ingested_bytes)
| makeTimeseries interval: 15m, time: usage.start, from: toTimestamp("${from}"), to: toTimestamp("${to}"), by: {costallocation}, nonempty: true, {
    adaptive_volume = sum(adaptive_volume, default: 0),
    fixed_rate_volume = sum(fixed_rate_volume, default: 0),
    other_volume = sum(other_volume, default: 0),
    start = start()
  }
// outer-join with the per-cost-allocation ratio of Full-Stack billed volume
| join [
    fetch dt.system.events, from: toTimestamp("${from}"), to: toTimestamp("${to}") + 10min
    | filter event.kind == "BILLING_USAGE_EVENT"
    | filter event.type == "Full-Stack Monitoring"
    | dedup event.id, event.type
    | fieldsAdd costallocation = dt.cost.costcenter
    | fieldsRemove dt.cost.costcenter, dt.cost.product
    | fieldsKeep usage.start, billed_gibibyte_hours, costallocation, event.id
    | makeTimeseries {billed = sum(billed_gibibyte_hours, default: 0)}, by: {costallocation}, time: usage.start, interval: 15m, from: toTimestamp("${from}"), to: toTimestamp("${to}")
    | summarize by: {timeframe, interval}, {total = sum(billed[]), r = collectArray(record(costallocation, billed))}
    | expand r
    | fieldsFlatten r, fields: {costallocation, billed}
    | fieldsAdd ratio = iCollectArray(coalesce((billed)[] / total[], 0.0))
    | fields timeframe, interval, costallocation, ratio, billed, total
    | fieldsAdd costallocation = if(isNull(costallocation), "${UNASSIGNED}", else: costallocation)
  ], on: {interval, costallocation}, kind: outer, prefix: "included."
| fieldsAdd timeframe = coalesce(timeframe, included.timeframe)
| fieldsAdd interval = coalesce(interval, included.interval)
| fieldsAdd costallocation = coalesce(costallocation, included.costallocation)
// environment-level included/configured volumes
| join [
    timeseries interval: 15m, union: true, nonempty: true, bucket: {"default_metrics"}, from: toTimestamp("${from}"), to: toTimestamp("${to}"), {
      included_volume = max(dt.billing.traces.maximum_included_fullstack_volume_per_minute, default: 0),
      configured_volume = max(dt.billing.traces.maximum_configured_fullstack_volume_per_minute, default: 0)
    }
    | fieldsAdd interval_in_minutes = toLong(interval) / 60000000000
    | fieldsAdd extra_ingest_on = configured_volume[] > included_volume[]
    | fieldsAdd included_volume = interval_in_minutes * if(isNull(configured_volume[]), null, else: included_volume[])
  ], on: {interval}, fields: {included_volume, extra_ingest_on}
// array of 0 with the length of the timeframe
| join [
    data record(a = 0)
    | makeTimeseries empty_included = avg(a, default: 0), interval: 15min, nonempty: true, time: now(), from: toTimestamp("${from}"), to: toTimestamp("${to}")
  ], on: {interval}, fields: {empty_included}, kind: outer
// array of false with the length of the timeframe
| join [
    data record(a = 0)
    | makeTimeseries empty_included = avg(a, default: 0), interval: 15min, nonempty: true, time: now(), from: toTimestamp("${from}"), to: toTimestamp("${to}")
    | expand empty_included
    | fieldsAdd all_false = empty_included == 1
    | summarize all_false = collectArray(all_false), by: interval
  ], on: {interval}, fields: {all_false}
| fieldsAdd extra_ingest_on = if(exists(extra_ingest_on) and isNotNull(extra_ingest_on), extra_ingest_on, else: all_false)
| fieldsAdd adaptive_volume = coalesce(iCollectArray(coalesce(adaptive_volume[], 0)), empty_included)
| fieldsAdd ratio = coalesce(iCollectArray(coalesce(included.ratio[], 0)), empty_included)
| fieldsAdd targetSize = if(arraySize(included_volume) > arraySize(ratio), then: arraySize(ratio), else: arraySize(adaptive_volume))
| fieldsAdd included_sliced = arraySlice(included_volume, to: targetSize)
| fieldsAdd ratio_sliced = arraySlice(ratio, to: targetSize)
| fieldsAdd volume_times_ratio = included_sliced[] * ratio_sliced[]
| fieldsAdd included_volume_costallocation = arraySlice(volume_times_ratio, to: arraySize(adaptive_volume))
| fieldsAdd fixed_rate_volume = coalesce(iCollectArray(coalesce(fixed_rate_volume[], 0)), empty_included)
| fieldsAdd other_volume = coalesce(iCollectArray(coalesce(other_volume[], 0)), empty_included)
| fieldsKeep timeframe, interval, costallocation, adaptive_volume, fixed_rate_volume, other_volume, included_volume_costallocation, extra_ingest_on, empty_included, start
// fullstack trace-ingest usage per cost allocation
| fieldsAdd included_volume_costallocation = arraySlice(included_volume_costallocation, to: arraySize(adaptive_volume))
| fieldsAdd license_remaining = included_volume_costallocation[] - adaptive_volume[]
| fieldsAdd license_remaining = if(license_remaining[] > 0, license_remaining[], else: 0)
| fieldsAdd extra_ingest_on = arraySlice(extra_ingest_on, to: arraySize(adaptive_volume))
| fieldsAdd billable_fullstack = if(isNull(included_volume_costallocation[]), 0,
    else: if(extra_ingest_on[], adaptive_volume[] + fixed_rate_volume[] - included_volume_costallocation[],
    else: fixed_rate_volume[] - license_remaining[]))
| fieldsAdd billable_fullstack = if(billable_fullstack[] > 0, billable_fullstack[], else: 0)
| summarize {
    total_included = sum(included_volume_costallocation[]),
    total_adaptive = sum(adaptive_volume[]),
    total_fixed_rate = sum(fixed_rate_volume[]),
    total_fullstack_to_allocate = sum(billable_fullstack[]),
    per_costallocation = collectArray(record(extra_ingest_on, billable_fullstack, billable_other = other_volume, costallocation, included_volume_costallocation, start))
  }, by: {interval}
| expand per_costallocation
| fieldsFlatten per_costallocation
| fieldsRemove per_costallocation
| fieldsAdd total_license_remaining = total_included[] - total_adaptive[]
| fieldsAdd total_license_remaining = if(total_license_remaining[] > 0, total_license_remaining[], else: 0)
| fieldsAdd total_applicable_fullstack = if(isNull(per_costallocation.included_volume_costallocation), 0,
    else: if(per_costallocation.extra_ingest_on[], total_adaptive[] + total_fixed_rate[] - total_included[],
    else: total_fixed_rate[] - total_license_remaining[]))
| fieldsAdd total_billable_fullstack = if(total_applicable_fullstack[] > 0, total_applicable_fullstack[], else: 0)
| fieldsAdd distributed_fullstack = if(total_fullstack_to_allocate[] <= 0, 0,
    else: per_costallocation.billable_fullstack[] / total_fullstack_to_allocate[] * total_billable_fullstack[])
| fieldsAdd billable = per_costallocation.billable_other[] + toDouble(distributed_fullstack[])
| filterOut isNull(billable) or isNull(per_costallocation.start) or isNull(per_costallocation.costallocation)
| fieldsAdd rec = iCollectArray(record(ts = per_costallocation.start[], bytes = billable[]))
| fields costcenter = per_costallocation.costallocation, rec
| expand rec
| fields capability = "Traces - Ingest & Process", costcenter, ts = rec[ts], usage = toDouble(rec[bytes]) / 1073741824`;

const metricsIngest = (from: string, to: string) => `fetch dt.system.events, from: toTimestamp("${from}") + 4h, to: toTimestamp("${to}") + 4h
| filter event.kind == "BILLING_USAGE_EVENT" and event.type == "Metrics - Ingest & Process"
| dedup event.id, event.type
| fieldsAdd costallocation = dt.cost.costcenter
| fieldsRemove dt.cost.costcenter, dt.cost.product
| expand costallocation
| fieldsFlatten costallocation
| fields {
    usage.start,
    costallocation = if(isNull(costallocation.key), "${UNASSIGNED}", else: costallocation.key),
    data_points = toLong(costallocation.data_points),
    monitoring_source = if(monitoring_source == "fullstack" or monitoring_source == "infrastructure", monitoring_source, else: "other")
  }
| summarize {data_points = toLong(sum(data_points))}, by: {usage.start, costallocation, monitoring_source}
// data points included with Full-Stack (900 per GiB-hour) and Infrastructure (1500 per host-hour) per 15 min
| join [
    fetch dt.system.events, from: toTimestamp("${from}"), to: toTimestamp("${to}") + 1h
    | filter event.kind == "BILLING_USAGE_EVENT" and in(event.type, {"Full-Stack Monitoring", "Infrastructure Monitoring"})
    | dedup event.id, event.type
    | fieldsAdd costallocation = dt.cost.costcenter
    | fields {
        usage.start,
        costallocation = if(isNotNull(costallocation), costallocation, else: "${UNASSIGNED}"),
        billed_value = coalesce(if(exists(billed_gibibyte_hours), billed_gibibyte_hours, else: null), if(exists(billed_host_hours), billed_host_hours, else: null)),
        monitoring_source = if(event.type == "Full-Stack Monitoring", "fullstack", else: if(event.type == "Infrastructure Monitoring", "infrastructure"))
      }
    | summarize {billed = sum(billed_value)}, by: {usage.start, costallocation, monitoring_source}
    | fields {
        usage.start,
        costallocation,
        monitoring_source,
        billed,
        included_usage = billed * 4 * if(monitoring_source == "fullstack", 900, else: if(monitoring_source == "infrastructure", 1500, else: 0))
      }
  ], on: {usage.start, costallocation, monitoring_source}, kind: leftOuter, fields: {included_usage}
| fieldsAdd included_usage = if(isNotNull(included_usage), included_usage, else: 0)
| fieldsAdd billable = if(data_points > included_usage, data_points - included_usage, else: 0)
| summarize {
    data_points_total = sum(data_points),
    included_total = sum(included_usage),
    billable_per_costallocation_total = sum(billable),
    rec = collectArray(record(costallocation, billable, included_usage))
  }, by: {usage.start, monitoring_source}
| fieldsAdd actual_billable_total = if(data_points_total > included_total, data_points_total - included_total, else: 0)
| expand rec
| fieldsAdd ratio_for_cost_allocation = rec[billable] / billable_per_costallocation_total
| fields capability = "Metrics - Ingest & Process", costcenter = rec[costallocation], ts = usage.start, usage = toDouble(ratio_for_cost_allocation * actual_billable_total)
| filter ts >= toTimestamp("${from}") and ts < toTimestamp("${to}")`;

/**
 * @param prevFrom - start of the previous period (the query covers prevFrom..to)
 * @param from - start of the current period
 * @param interval - bucket size of the returned records, matching the trend charts
 */
export function normalizedIngestQuery(
  prevFrom: string,
  from: string,
  to: string,
  interval: string
): string {
  return `${tracesIngest(prevFrom, to)}
| append [
${metricsIngest(prevFrom, to)}
]
| filter usage > 0
| fieldsAdd period = if(ts >= toTimestamp("${from}"), "current", else: "previous")
| summarize usage = sum(usage), by: {capability, period, costcenter, bucket = bin(ts, ${interval})}`;
}
