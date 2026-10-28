/**
 * DPS list prices (USD), taken from the "DPS Cost Allocation Overview Dashboard v3.11".
 * Admins can override them on the Rate Card page (see buildRates).
 * `price` is charged per `priceUnit` units of `unitName`.
 */
export interface RateCardEntry {
  key: string;
  name: string;
  category: string;
  unitName: string;
  price: number;
  priceUnit: number;
}

export const CURRENCY = "USD";

export const RATE_CARD: RateCardEntry[] = [
  { key: "FOUNDATION_AND_DISCOVERY", name: "Foundation & Discovery", category: "Application and Infrastructure Observability", unitName: "host-hours", price: 1000, priceUnit: 100000 },
  { key: "FULLSTACK_MONITORING", name: "Full-Stack Monitoring", category: "Application and Infrastructure Observability", unitName: "memory-GiB-hours", price: 1000, priceUnit: 100000 },
  { key: "INFRASTRUCTURE_MONITORING", name: "Infrastructure Monitoring", category: "Application and Infrastructure Observability", unitName: "host-hours", price: 4000, priceUnit: 100000 },
  { key: "MAINFRAME_MONITORING", name: "Mainframe Monitoring", category: "Application and Infrastructure Observability", unitName: "MSU-hours", price: 1000, priceUnit: 10000 },
  { key: "DATABASE_MONITORING", name: "Database Monitoring", category: "Application and Infrastructure Observability", unitName: "database-instance-hours", price: 4000, priceUnit: 100000 },
  { key: "CODE_MONITORING", name: "Code Monitoring", category: "Container Observability", unitName: "container-hours", price: 500, priceUnit: 100000 },
  { key: "KUBERNETES_OPERATIONS", name: "Kubernetes Platform Monitoring", category: "Container Observability", unitName: "pod-hours", price: 200, priceUnit: 100000 },
  { key: "LOG_MANAGEMENT_INGEST", name: "Log Management & Analytics - Ingest & Process", category: "Log Analytics", unitName: "GiB", price: 2000, priceUnit: 10000 },
  { key: "LOG_MANAGEMENT_ANALYZE", name: "Log Management & Analytics - Query", category: "Log Analytics", unitName: "GiB scanned", price: 3500, priceUnit: 1000000 },
  { key: "LOG_MANAGEMENT_RETAIN", name: "Log Management & Analytics - Retain", category: "Log Analytics", unitName: "GiB-days", price: 700, priceUnit: 1000000 },
  { key: "LOG_MANAGEMENT_RETAIN_QUERY_INCLUDED", name: "Log Management & Analytics - Retain with Included Queries", category: "Log Analytics", unitName: "GiB-days", price: 20000, priceUnit: 1000000 },
  { key: "RUNTIME_APPLICATION_PROTECTION", name: "Runtime Application Protection", category: "Application Security", unitName: "memory-GiB-hours", price: 225, priceUnit: 100000 },
  { key: "RUNTIME_VULNERABILITY_ANALYTICS", name: "Runtime Vulnerability Analytics", category: "Application Security", unitName: "memory-GiB-hours", price: 225, priceUnit: 100000 },
  { key: "SECURITY_POSTURE_MANAGEMENT", name: "Security Posture Management", category: "Application Security", unitName: "host-hours", price: 700, priceUnit: 100000 },
  { key: "SYNTHETIC_MONITORING_BROWSER", name: "Browser Monitor or Clickpath", category: "Digital Experience Monitoring", unitName: "synthetic actions", price: 450, priceUnit: 100000 },
  { key: "SYNTHETIC_MONITORING_HTTP", name: "HTTP Monitor", category: "Digital Experience Monitoring", unitName: "synthetic requests", price: 100, priceUnit: 100000 },
  { key: "SYNTHETIC_MONITORING_THIRD_PARTY", name: "Third-Party Synthetic API Ingestion", category: "Digital Experience Monitoring", unitName: "third-party results", price: 100, priceUnit: 100000 },
  { key: "USER_SESSIONS", name: "Real User Monitoring", category: "Digital Experience Monitoring", unitName: "sessions", price: 225, priceUnit: 100000 },
  { key: "USER_SESSION_PROPERTIES", name: "Real User Monitoring Property", category: "Digital Experience Monitoring", unitName: "properties per session", price: 10, priceUnit: 100000 },
  { key: "USER_SESSION_REPLAYS", name: "Real User Monitoring with Session Replay", category: "Digital Experience Monitoring", unitName: "replay captures", price: 450, priceUnit: 100000 },
  { key: "DEM_RETAIN", name: "Digital Experience Monitoring - Retain", category: "Digital Experience Monitoring", unitName: "GiB-days", price: 4000, priceUnit: 1000000 },
  { key: "DEM_QUERY", name: "Digital Experience Monitoring - Query", category: "Digital Experience Monitoring", unitName: "GiB scanned", price: 3500, priceUnit: 1000000 },
  { key: "METRICS_INGEST", name: "Metrics - Ingest & Process", category: "Metrics powered by Grail", unitName: "data points", price: 150, priceUnit: 100000000 },
  { key: "METRICS_QUERY", name: "Metrics - Query", category: "Metrics powered by Grail", unitName: "GiB scanned", price: 0, priceUnit: 1000000 },
  { key: "METRICS_EXTENDED_RETAIN", name: "Metrics - Retain", category: "Metrics powered by Grail", unitName: "GiB-days", price: 700, priceUnit: 1000000 },
  { key: "TRACE_INGEST", name: "Traces - Ingest & Process", category: "Traces powered by Grail", unitName: "GiB", price: 2000, priceUnit: 10000 },
  { key: "TRACE_QUERY", name: "Traces - Query", category: "Traces powered by Grail", unitName: "GiB scanned", price: 3500, priceUnit: 1000000 },
  { key: "TRACE_RETAIN", name: "Traces - Retain", category: "Traces powered by Grail", unitName: "GiB-days", price: 700, priceUnit: 1000000 },
  { key: "EVENTS_INGEST", name: "Events - Ingest & Process", category: "Events powered by Grail", unitName: "GiB", price: 2000, priceUnit: 10000 },
  { key: "EVENTS_ANALYZE", name: "Events - Query", category: "Events powered by Grail", unitName: "GiB scanned", price: 3500, priceUnit: 1000000 },
  { key: "EVENTS_RETAIN", name: "Events - Retain", category: "Events powered by Grail", unitName: "GiB-days", price: 700, priceUnit: 1000000 },
  { key: "FILES_RETAIN", name: "Files - Retain", category: "Events powered by Grail", unitName: "GiB-days", price: 700, priceUnit: 1000000 },
  { key: "AUTOMATIONS", name: "Automation Workflow", category: "Automation", unitName: "workflow-hours", price: 300, priceUnit: 10000 },
  { key: "COMPUTE", name: "AppEngine Functions - Small", category: "AppEngine Functions", unitName: "invocations", price: 1000, priceUnit: 1000000 },
  { key: "AI_FUNCTIONS", name: "AI Units", category: "AppEngine Functions", unitName: "AI units", price: 1000, priceUnit: 1000000 },
  { key: "DATA_EGRESS", name: "Data Egress", category: "Platform", unitName: "GiB", price: 1000, priceUnit: 10000 },
  { key: "CUSTOM_EVENTS_CLASSIC", name: "Custom Events Classic", category: "Platform Extensions", unitName: "custom events", price: 200, priceUnit: 100000000 },
  { key: "CUSTOM_METRICS_CLASSIC", name: "Custom Metrics Classic", category: "Platform Extensions", unitName: "data points", price: 200, priceUnit: 100000000 },
  { key: "CUSTOM_TRACES_CLASSIC", name: "Custom Traces Classic", category: "Platform Extensions", unitName: "spans", price: 140, priceUnit: 100000000 },
  { key: "LOG_MONITORING_CLASSIC", name: "Log Monitoring Classic", category: "Platform Extensions", unitName: "log records", price: 100, priceUnit: 100000000 },
  { key: "SERVERLESS_FUNCTIONS_CLASSIC", name: "Serverless Functions Classic", category: "Platform Extensions", unitName: "invocations", price: 400, priceUnit: 100000000 },
];

const BY_NAME = new Map(RATE_CARD.map((entry) => [entry.name, entry]));

export const UNCATEGORIZED = "Other";

/** List-price entry of a capability (category, unit, list price). */
export function getRate(capability: string): RateCardEntry | undefined {
  return BY_NAME.get(capability);
}

/** Admin-defined price for a capability, stored in the "rate-card" app settings object. */
export interface PriceOverride {
  capability: string;
  price: number;
  priceUnit: number;
}

/** Effective prices by capability name. */
export type Rates = ReadonlyMap<string, RateCardEntry>;

export const LIST_RATES: Rates = BY_NAME;

/** List prices with the given overrides applied. */
export function buildRates(overrides: readonly PriceOverride[]): Rates {
  if (overrides.length === 0) return LIST_RATES;
  const rates = new Map(BY_NAME);
  for (const { capability, price, priceUnit } of overrides) {
    const base = rates.get(capability);
    if (base && priceUnit > 0) rates.set(capability, { ...base, price, priceUnit });
  }
  return rates;
}

/** Estimated cost in USD for `usage` units of a capability; 0 when the capability has no price. */
export function estimateCost(rates: Rates, capability: string, usage: number): number {
  const rate = rates.get(capability);
  return rate ? (usage * rate.price) / rate.priceUnit : 0;
}
