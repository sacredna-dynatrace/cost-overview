import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Timeframe } from "@dynatrace/strato-components/core";
import type { Timeseries } from "@dynatrace/strato-components/charts";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { getEnvironmentId } from "@dynatrace-sdk/app-environment";
import type { AccountCostRecord } from "../account/accountData";
import { useAccountCost, type AccountCostResult } from "../account/useAccountCost";
import { normalizedIngestQuery, type NormalizedRecord } from "./normalizedQueries";
import { attributionQuery, trendQuery, UNASSIGNED } from "./queries";
import { estimateCost, getRate, UNCATEGORIZED, type Rates } from "./rateCard";
import { useAppSettings } from "../settings/AppSettingsContext";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface CapabilityTotal {
  capability: string;
  category: string;
  unitName: string;
  usage: number;
  cost: number;
}

export interface CostCenterRow {
  costcenter: string;
  totalCost: number;
  previousCost: number;
  /** Relative change vs. the previous period, `null` when there was no previous cost. */
  change: number | null;
  share: number;
  usage: Record<string, number>;
  cost: Record<string, number>;
}

export interface CostSummary {
  totalCost: number;
  previousCost: number;
  change: number | null;
  /** Share of cost attributed to a cost center other than "unassigned" (0..1). */
  coverage: number;
  rows: CostCenterRow[];
  capabilities: CapabilityTotal[];
  categories: { category: string; cost: number }[];
}

export interface QueryRange {
  /** Start of the equally long period directly before `from`. */
  prevFrom: string;
  from: string;
  to: string;
  interval: string;
  /** `interval` in milliseconds. */
  step: number;
}

export interface Tenant {
  id: string;
  name: string;
  isCurrent: boolean;
}

interface CostDataContextValue {
  /**
   * The environment being viewed. The current environment uses Grail (host level, list-price estimate);
   * other environments use billed cost from the Account Management API (daily, cost center tag).
   * Only admins can select other environments.
   */
  tenant: Tenant;
  /** Environments that can be selected; empty for non-admins. */
  tenants: Tenant[];
  setTenant: (id: string) => void;
  source: "grail" | "account";
  /** Billed records of the selected remote environment (empty for the current environment). */
  accountRecords: { current: AccountCostRecord[]; previous: AccountCostRecord[] };
  /** Account-wide data for the Account page (admins only; demo data when not connected). */
  account: AccountCostResult;
  timeframe: Timeframe;
  range: QueryRange;
  setTimeframe: (timeframe: Timeframe) => void;
  summary: CostSummary | undefined;
  trend: Timeseries[] | undefined;
  isLoading: boolean;
  isTrendLoading: boolean;
  /** Normalized Traces / Metrics ingest usage, merged into `summary` and `trend`. */
  normalized: NormalizedRecord[] | undefined;
  error: Error | undefined;
  refetch: () => void;
}

const CostDataContext = createContext<CostDataContextValue | undefined>(
  undefined
);

interface AttributionRecord {
  period: string;
  costcenter: string;
  capability: string;
  usage: number;
  /** Billed cost; estimated from the rate card when absent. */
  cost?: number;
}

export interface TrendRecord {
  capability: string;
  interval: string;
  timeframe: { start: string; end: string };
  usage: (number | null)[];
}

function initialTimeframe(): Timeframe {
  const now = new Date();
  now.setSeconds(0, 0);
  return {
    from: {
      type: "expression",
      value: "now-7d",
      absoluteDate: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
    },
    to: { type: "expression", value: "now", absoluteDate: now.toISOString() },
  };
}

const changeOf = (current: number, previous: number) =>
  previous > 0 ? (current - previous) / previous : null;

function summarize(records: AttributionRecord[], rates: Rates): CostSummary {
  const rows = new Map<string, CostCenterRow>();
  const capabilities = new Map<string, CapabilityTotal>();
  let totalCost = 0;
  let previousCost = 0;

  const rowFor = (costcenter: string) => {
    let row = rows.get(costcenter);
    if (!row) {
      row = {
        costcenter,
        totalCost: 0,
        previousCost: 0,
        change: null,
        share: 0,
        usage: {},
        cost: {},
      };
      rows.set(costcenter, row);
    }
    return row;
  };

  for (const { period, costcenter, capability, usage, cost: billed } of records) {
    const cost = billed ?? estimateCost(rates, capability, usage);
    const row = rowFor(costcenter);
    if (period === "previous") {
      row.previousCost += cost;
      previousCost += cost;
      continue;
    }
    row.totalCost += cost;
    row.usage[capability] = (row.usage[capability] ?? 0) + usage;
    row.cost[capability] = (row.cost[capability] ?? 0) + cost;
    totalCost += cost;

    const rate = getRate(capability);
    const total = capabilities.get(capability) ?? {
      capability,
      category: rate?.category ?? UNCATEGORIZED,
      unitName: rate?.unitName ?? "",
      usage: 0,
      cost: 0,
    };
    total.usage += usage;
    total.cost += cost;
    capabilities.set(capability, total);
  }

  const categories = new Map<string, number>();
  for (const { category, cost } of capabilities.values()) {
    categories.set(category, (categories.get(category) ?? 0) + cost);
  }

  // Cost centers that only appear in the previous period are dropped from the table.
  const currentRows = [...rows.values()]
    .filter((row) => Object.keys(row.usage).length > 0)
    .map((row) => ({
      ...row,
      change: changeOf(row.totalCost, row.previousCost),
      share: totalCost > 0 ? row.totalCost / totalCost : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);

  const unassignedCost = rows.get(UNASSIGNED)?.totalCost ?? 0;

  return {
    totalCost,
    previousCost,
    change: changeOf(totalCost, previousCost),
    coverage: totalCost > 0 ? 1 - unassignedCost / totalCost : 0,
    rows: currentRows,
    capabilities: [...capabilities.values()].sort((a, b) => b.cost - a.cost),
    categories: [...categories.entries()]
      .map(([category, cost]) => ({ category, cost }))
      .sort((a, b) => b.cost - a.cost),
  };
}

/** Converts per-capability usage series into estimated cost series, grouped by category or capability. */
export function toCostSeries(
  records: TrendRecord[],
  groupBy: "category" | "capability",
  rates: Rates
): Timeseries[] {
  const byGroup = new Map<string, number[]>();
  let start = 0;
  let step = 0;
  for (const record of records) {
    start = Date.parse(record.timeframe.start);
    step = Number(record.interval) / 1e6;
    const group =
      groupBy === "capability"
        ? record.capability
        : (getRate(record.capability)?.category ?? UNCATEGORIZED);
    const values = byGroup.get(group) ?? [];
    record.usage.forEach((usage, i) => {
      values[i] = (values[i] ?? 0) + estimateCost(rates, record.capability, usage ?? 0);
    });
    byGroup.set(group, values);
  }
  return [...byGroup.entries()]
    .map(([group, values]) => ({
      name: group,
      unit: "USD",
      datapoints: values.map((value, i) => ({
        start: new Date(start + i * step),
        end: new Date(start + (i + 1) * step),
        value,
      })),
    }))
    .sort(
      (a, b) =>
        b.datapoints.reduce((sum, d) => sum + d.value, 0) -
        a.datapoints.reduce((sum, d) => sum + d.value, 0)
    );
}

/**
 * Converts normalized bucket records of one period into TrendRecords that line up with
 * the makeTimeseries buckets of [from, to), optionally for a single cost center.
 */
export function toTrendRecords(
  records: NormalizedRecord[],
  period: NormalizedRecord["period"],
  from: string,
  to: string,
  step: number,
  costcenter?: string
): TrendRecord[] {
  const start = Math.floor(Date.parse(from) / step) * step;
  const length = Math.ceil((Date.parse(to) - start) / step);
  const byCapability = new Map<string, number[]>();
  for (const record of records) {
    if (record.period !== period) continue;
    if (costcenter !== undefined && record.costcenter !== costcenter) continue;
    const index = Math.round((Date.parse(record.bucket) - start) / step);
    if (index < 0 || index >= length) continue;
    const values = byCapability.get(record.capability) ?? new Array<number>(length).fill(0);
    values[index] += Number(record.usage);
    byCapability.set(record.capability, values);
  }
  return [...byCapability.entries()].map(([capability, usage]) => ({
    capability,
    interval: String(step * 1e6),
    timeframe: { start: new Date(start).toISOString(), end: new Date(start + length * step).toISOString() },
    usage,
  }));
}

/** Daily cost series from billed records, grouped by category or capability. */
export function toDailyCostSeries(
  records: AccountCostRecord[],
  groupBy: "category" | "capability"
): Timeseries[] {
  const days = [...new Set(records.map((r) => r.date))].sort();
  const byGroup = new Map<string, Map<string, number>>();
  for (const r of records) {
    const group =
      groupBy === "capability" ? r.capability : (getRate(r.capability)?.category ?? UNCATEGORIZED);
    const values = byGroup.get(group) ?? new Map<string, number>();
    values.set(r.date, (values.get(r.date) ?? 0) + r.cost);
    byGroup.set(group, values);
  }
  return [...byGroup.entries()]
    .map(([group, values]) => ({
      name: group,
      unit: "USD",
      datapoints: days.map((day) => {
        const start = new Date(`${day}T00:00:00Z`);
        return { start, end: new Date(start.getTime() + DAY_MS), value: values.get(day) ?? 0 };
      }),
    }))
    .sort(
      (a, b) =>
        b.datapoints.reduce((sum, d) => sum + d.value, 0) -
        a.datapoints.reduce((sum, d) => sum + d.value, 0)
    );
}

const CURRENT_ENVIRONMENT_ID = getEnvironmentId();
const CURRENT_TENANT: Tenant = {
  id: CURRENT_ENVIRONMENT_ID,
  name: `Current environment (${CURRENT_ENVIRONMENT_ID})`,
  isCurrent: true,
};
const NO_RECORDS = { current: [], previous: [] };

export const CostDataProvider = ({ children }: React.PropsWithChildren) => {
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const { rates, isAdmin } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();

  const { range, attribution, trend, normalized } = useMemo(() => {
    const from = timeframe.from.absoluteDate;
    const to = timeframe.to.absoluteDate;
    const duration = Date.parse(to) - Date.parse(from);
    const prevFrom = new Date(Date.parse(from) - duration).toISOString();
    const [interval, step] = duration <= 2 * DAY_MS ? ["1h", HOUR_MS] : ["1d", DAY_MS];
    return {
      range: { prevFrom, from, to, interval, step },
      attribution: attributionQuery(prevFrom, from, to),
      trend: trendQuery(from, to, interval),
      normalized: normalizedIngestQuery(prevFrom, from, to, interval),
    };
  }, [timeframe]);

  const account = useAccountCost(range, isAdmin, rates, CURRENT_ENVIRONMENT_ID);

  const tenants = useMemo<Tenant[]>(() => {
    if (!isAdmin) return [];
    const others = (account.data?.environments ?? []).filter((e) => e.id !== CURRENT_ENVIRONMENT_ID);
    return [CURRENT_TENANT, ...others.map((e) => ({ id: e.id, name: e.name, isCurrent: false }))];
  }, [isAdmin, account.data]);

  const requestedTenant = searchParams.get("tenant");
  const remoteTenant =
    isAdmin && requestedTenant && requestedTenant !== CURRENT_ENVIRONMENT_ID
      ? tenants.find((t) => t.id === requestedTenant)
      : undefined;
  const tenant = remoteTenant ?? CURRENT_TENANT;
  const isRemote = remoteTenant !== undefined;

  const setTenant = useCallback(
    (id: string) =>
      setSearchParams((params) => {
        if (id === CURRENT_ENVIRONMENT_ID) params.delete("tenant");
        else params.set("tenant", id);
        return params;
      }),
    [setSearchParams]
  );

  // Grail queries only describe the current environment.
  const attributionResult = useDql<AttributionRecord>(attribution, { enabled: !isRemote });
  const trendResult = useDql<TrendRecord>(trend, { enabled: !isRemote });
  const normalizedResult = useDql<NormalizedRecord>(normalized, { enabled: !isRemote });
  const normalizedRecords = normalizedResult.data?.records;

  const accountRecords = useMemo(() => {
    if (!remoteTenant || !account.data) return NO_RECORDS;
    const ofTenant = (records: AccountCostRecord[]) =>
      records.filter((r) => r.environmentId === remoteTenant.id);
    return { current: ofTenant(account.data.current), previous: ofTenant(account.data.previous) };
  }, [remoteTenant, account.data]);

  const remoteSummary = useMemo(
    () =>
      remoteTenant && account.data
        ? summarize(
            [
              ...accountRecords.current.map((r) => ({ ...r, period: "current" })),
              ...accountRecords.previous.map((r) => ({ ...r, period: "previous" })),
            ],
            rates
          )
        : undefined,
    [remoteTenant, account.data, accountRecords, rates]
  );

  const remoteTrend = useMemo(
    () =>
      remoteTenant && account.data ? toDailyCostSeries(accountRecords.current, "category") : undefined,
    [remoteTenant, account.data, accountRecords]
  );

  // Wait for the normalized ingest usage as well, so totals don't jump once it arrives.
  const summary = useMemo(
    () =>
      attributionResult.data && normalizedRecords
        ? summarize([
            ...attributionResult.data.records,
            ...normalizedRecords.map((r) => ({ ...r, usage: Number(r.usage) })),
          ], rates)
        : undefined,
    [attributionResult.data, normalizedRecords, rates]
  );

  const trendSeries = useMemo(
    () =>
      trendResult.data && normalizedRecords
        ? toCostSeries(
            [
              ...trendResult.data.records,
              ...toTrendRecords(normalizedRecords, "current", range.from, range.to, range.step),
            ],
            "category",
            rates
          )
        : undefined,
    [trendResult.data, normalizedRecords, range, rates]
  );

  const shared = { tenant, tenants, setTenant, timeframe, range, setTimeframe, account };
  const value: CostDataContextValue = isRemote
    ? {
        ...shared,
        source: "account",
        accountRecords,
        summary: remoteSummary,
        trend: remoteTrend,
        normalized: undefined,
        isLoading: account.isLoading,
        isTrendLoading: account.isLoading,
        error: undefined,
        refetch: account.refetch,
      }
    : {
        ...shared,
        source: "grail",
        accountRecords: NO_RECORDS,
        summary,
        trend: trendSeries,
        normalized: normalizedRecords,
        isLoading: attributionResult.isLoading || normalizedResult.isLoading,
        isTrendLoading: trendResult.isLoading || normalizedResult.isLoading,
        error: attributionResult.error ?? trendResult.error ?? normalizedResult.error ?? undefined,
        refetch: () => {
          void attributionResult.refetch();
          void trendResult.refetch();
          void normalizedResult.refetch();
        },
      };

  return (
    <CostDataContext.Provider value={value}>{children}</CostDataContext.Provider>
  );
};

export function useCostData(): CostDataContextValue {
  const context = useContext(CostDataContext);
  if (!context) {
    throw new Error("useCostData must be used within a CostDataProvider");
  }
  return context;
}
