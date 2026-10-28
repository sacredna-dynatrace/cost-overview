import { getRate } from "../cost/rateCard";

/**
 * Account-wide cost data (all environments of the subscription).
 *
 * Real data comes from the "account-cost" app function (see accountApi.ts). When the connection
 * is not configured or fails, `demoAccountCost` provides deterministic example data of the same shape.
 */
export interface AccountEnvironment {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface AccountCostRecord {
  /** Day (UTC, ISO date). */
  date: string;
  environmentId: string;
  costcenter: string;
  capability: string;
  cost: number;
  /** Billed usage in the capability's unit (see rateCard.ts). */
  usage: number;
}

export interface AccountCostData {
  /** "billed": cost from the API · "estimated": billed usage × rate card · "demo": example data. */
  source: "billed" | "estimated" | "demo";
  currency: string;
  /** Commit of the current subscription period, when the subscription defines one. */
  budget?: { total: number; used: number };
  period: { start: string; end: string; daysRemaining: number };
  environments: AccountEnvironment[];
  current: AccountCostRecord[];
  previous: AccountCostRecord[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const DEMO_ENVIRONMENTS: { id: string; name: string; scale: number; costcenters: string[] }[] = [
  { id: "prd00001", name: "Production", scale: 1, costcenters: ["payments", "search", "platform", "unassigned"] },
  { id: "abc12345", name: "Production EU", scale: 0.7, costcenters: ["payments", "checkout", "unassigned"] },
  { id: "stg67890", name: "Staging", scale: 0.25, costcenters: ["platform", "qa", "unassigned"] },
  { id: "dev24680", name: "Development", scale: 0.12, costcenters: ["platform", "unassigned"] },
];

/** Base daily cost (USD) per capability for a scale-1 environment. */
const DEMO_CAPABILITIES: [string, number][] = [
  ["Full-Stack Monitoring", 420],
  ["Log Management & Analytics - Ingest & Process", 180],
  ["Log Management & Analytics - Retain", 60],
  ["Traces - Ingest & Process", 90],
  ["Real User Monitoring", 70],
  ["Infrastructure Monitoring", 55],
  ["Browser Monitor or Clickpath", 25],
  ["Automation Workflow", 12],
];

/** Small deterministic PRNG so the demo looks the same on every load. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function demoRecords(from: number, to: number, environments: AccountEnvironment[]): AccountCostRecord[] {
  const records: AccountCostRecord[] = [];
  const firstDay = Math.floor(from / DAY_MS) * DAY_MS;
  for (let day = firstDay; day < to; day += DAY_MS) {
    const date = new Date(day).toISOString().slice(0, 10);
    // Slow upward trend plus weekly seasonality.
    const trend = 1 + (day / DAY_MS - 20000) * 0.002;
    const weekday = new Date(day).getUTCDay();
    const seasonal = weekday === 0 || weekday === 6 ? 0.82 : 1;
    DEMO_ENVIRONMENTS.forEach((demo, i) => {
      const environmentId = environments[i].id;
      demo.costcenters.forEach((costcenter, c) => {
        const share = 1 / (c + 1.5);
        for (const [capability, base] of DEMO_CAPABILITIES) {
          const noise = 0.85 + 0.3 * hash(`${date}|${environmentId}|${costcenter}|${capability}`);
          const cost = Math.round(base * demo.scale * share * trend * seasonal * noise * 100) / 100;
          const rate = getRate(capability);
          records.push({
            date,
            environmentId,
            costcenter,
            capability,
            cost,
            usage: rate && rate.price > 0 ? (cost * rate.priceUnit) / rate.price : 0,
          });
        }
      });
    });
  }
  return records;
}

export function demoAccountCost(from: string, to: string): AccountCostData {
  // Demo environments are fictional on purpose, so example numbers are never shown next to a
  // real environment ID. With real data, `isCurrent` marks the environment the app runs in.
  const environments = DEMO_ENVIRONMENTS.map((demo) => ({
    id: demo.id,
    name: `${demo.name} (${demo.id})`,
    isCurrent: false,
  }));
  const fromMs = Date.parse(from);
  // Costs are calculated once a day, so the last 24 hours are not available yet.
  const toMs = Math.min(Date.parse(to), Date.now() - DAY_MS);
  const duration = Date.parse(to) - fromMs;
  const current = demoRecords(fromMs, toMs, environments);
  const previous = demoRecords(fromMs - duration, fromMs, environments);

  const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const periodEnd = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));
  const elapsedDays = (Date.now() - periodStart.getTime()) / DAY_MS;

  return {
    source: "demo",
    currency: "USD",
    budget: { total: 500000, used: Math.round(elapsedDays * 1150) },
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      daysRemaining: Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / DAY_MS)),
    },
    environments,
    current,
    previous,
  };
}
