/**
 * DQL for billing usage events (BILLING_USAGE_EVENT), based on the
 * "DPS Cost Allocation Overview Dashboard v3.11".
 *
 * The "Cost center" group currently resolves to the host name. Events without a host
 * fall back to dt.cost.costcenter, then to "unassigned".
 *
 * Traces and Metrics ingest are excluded here; their billable usage comes from normalizedQueries.ts.
 */
export const UNASSIGNED = "unassigned";

export const NORMALIZED_CAPABILITIES = [
  "Traces - Ingest & Process",
  "Metrics - Ingest & Process",
];

const usageBase = (from: string, to: string) => `fetch dt.system.events, from: toTimestamp("${from}"), to: toTimestamp("${to}")
| filter event.kind == "BILLING_USAGE_EVENT"
| filterOut in(event.type, {${NORMALIZED_CAPABILITIES.map((c) => `"${c}"`).join(", ")}})
| fieldsAdd event.type = if(in(event.type, {"Federated Analytics - Query", "Files - Query"}), "Events - Query", else: event.type)
| dedup event.id, event.type
| fieldsAdd ts = coalesce(usage.start, timestamp)
| fieldsAdd cc = if(isNull(dt.cost.costcenter), array(record(key = "${UNASSIGNED}")), else: dt.cost.costcenter)
| expand cc
| fieldsAdd billed_bytes = coalesce(cc[billed_bytes], billed_bytes)
| fieldsAdd usage = coalesce(
    billed_host_hours,
    billed_gibibyte_hours,
    toDouble(billed_bytes) / 1073741824,
    toDouble(billed_invocations),
    toDouble(billed_sessions),
    toDouble(billed_replay_sessions),
    toDouble(billed_property_sessions),
    billed_pod_hours,
    billed_container_hours,
    toDouble(billed_synthetic_action_count),
    toDouble(billed_http_request_count),
    billed_msu_hours,
    \`database-instance-hours\`,
    usage.quantity.billable,
    1)
| fieldsAdd usage = if(contains(event.type, "Retain"), usage / 24, else: usage)`;

const costCenterField = `| fieldsAdd host = if(isNotNull(dt.entity.host), entityName(dt.entity.host))
| fieldsAdd costcenter = coalesce(host, cc[key], "${UNASSIGNED}")`;

const dqlString = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const timeseries = (from: string, to: string, interval: string) =>
  `| makeTimeseries usage = sum(usage, default: 0), by: {capability = event.type}, time: ts, interval: ${interval}, from: toTimestamp("${from}"), to: toTimestamp("${to}")`;

/** Usage per cost center and capability, for the selected period and the equally long period before it. */
export function attributionQuery(prevFrom: string, from: string, to: string): string {
  return `${usageBase(prevFrom, to)}
| fieldsAdd period = if(ts >= toTimestamp("${from}"), "current", else: "previous")
${costCenterField}
| summarize usage = sum(usage), by: {period, costcenter, capability = event.type}`;
}

/** Usage time series per capability. */
export function trendQuery(from: string, to: string, interval: string): string {
  return `${usageBase(from, to)}
${timeseries(from, to, interval)}`;
}

/** Usage time series per capability for a single cost center. */
export function costCenterTrendQuery(
  costcenter: string,
  from: string,
  to: string,
  interval: string
): string {
  return `${usageBase(from, to)}
${costCenterField}
| filter costcenter == ${dqlString(costcenter)}
${timeseries(from, to, interval)}`;
}

/** Per capability: number of billing events, events with a cost center tag, and events with a host. */
export function coverageQuery(from: string, to: string): string {
  return `fetch dt.system.events, from: toTimestamp("${from}"), to: toTimestamp("${to}")
| filter event.kind == "BILLING_USAGE_EVENT"
| dedup event.id, event.type
| fieldsAdd ccText = toString(dt.cost.costcenter)
| fieldsAdd tagged = isNotNull(dt.cost.costcenter) and ccText != "${UNASSIGNED}" and not contains(ccText, "\\"key\\":\\"${UNASSIGNED}\\"")
| summarize events = count(), tagged = countIf(tagged), withHost = countIf(isNotNull(dt.entity.host)), by: {capability = event.type}`;
}
