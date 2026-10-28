import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";

/**
 * Account-wide usage and cost from the Dynatrace Account Management API.
 *
 * Credentials come from the "account-connection" app settings object. Its secret is only readable
 * in plain text inside an app function and only for users allowed to read the schema (app admins),
 * so non-admins cannot obtain account data through this function.
 *
 * Data sources, in order of preference:
 *  - cost per environment and day: /environments/cost (billed); when empty, the UI estimates cost
 *    from usage with the rate card
 *  - usage per environment and day: /environments/usage
 *  - split by cost center: /v1/.../cost-allocation; usage not covered by it is "unassigned"
 */

const SSO = "https://sso.dynatrace.com/sso/oauth2/token";
const API = "https://api.dynatrace.com";
const SCHEMA_ID = "account-connection";
const UNASSIGNED = "unassigned";
const DAY_MS = 24 * 60 * 60 * 1000;

interface Payload {
  prevFrom: string;
  from: string;
  to: string;
}

interface Connection {
  accountUuid: string;
  clientId: string;
  clientSecret: string;
}

export interface AccountApiRecord {
  /** UTC day, YYYY-MM-DD. */
  date: string;
  environmentId: string;
  costcenter: string;
  capabilityKey: string;
  capability: string;
  usage: number;
  unit: string;
  /** Billed cost, when the API provides it. */
  cost?: number;
}

export interface AccountApiResult {
  status: "ok" | "not-configured" | "error";
  message?: string;
  costSource?: "billed" | "usage";
  environments?: { id: string; name: string; active: boolean }[];
  subscription?: {
    name: string;
    startTime: string;
    endTime: string;
    daysRemaining?: number;
    budgetTotal?: number;
    budgetUsed?: number;
    currency?: string;
  };
  current?: AccountApiRecord[];
  previous?: AccountApiRecord[];
}

type Json = Record<string, unknown>;

const asArray = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);
const asString = (value: unknown) => (typeof value === "string" ? value : undefined);
const asNumber = (value: unknown) => {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function readConnection(): Promise<Connection | undefined> {
  const { items } = await appSettingsObjectsClient.getAppSettingsObjects({
    schemaId: SCHEMA_ID,
    addFields: "value",
  });
  const value = items[0]?.value as Partial<Connection> | undefined;
  if (!value?.accountUuid || !value.clientId || !value.clientSecret) return undefined;
  return {
    accountUuid: value.accountUuid.trim(),
    clientId: value.clientId.trim(),
    clientSecret: value.clientSecret.trim(),
  };
}

async function requestToken({ accountUuid, clientId, clientSecret }: Connection): Promise<string> {
  const res = await fetch(SSO, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "account-uac-read account-env-read",
      resource: `urn:dtaccount:${accountUuid}`,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  const token = asString(json.access_token);
  if (!res.ok || !token) {
    throw new Error(
      `OAuth token request failed (${res.status} ${asString(json.error) ?? ""}). ` +
        "Check the client ID/secret and that the client has the account-uac-read and account-env-read scopes."
    );
  }
  return token;
}

function client(token: string) {
  return async (path: string): Promise<Json> => {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`GET ${path.split("?")[0]} failed with ${res.status}`);
    return (await res.json()) as Json;
  };
}

interface DayRange {
  start: string;
  end: string;
}

const rangeQuery = ({ start, end }: DayRange) =>
  `startTime=${start}T00:00:00.000Z&endTime=${end}T23:59:59.999Z`;

const inRange = (date: string, { start, end }: DayRange) => date >= start && date <= end;

/** Usage per environment, day and capability. */
async function environmentUsage(get: ReturnType<typeof client>, base: string, range: DayRange) {
  const json = await get(`${base}/environments/usage?${rangeQuery(range)}`);
  const records: AccountApiRecord[] = [];
  for (const env of asArray(json.data)) {
    const environmentId = asString(env.environmentId) ?? "";
    for (const u of asArray(env.usage)) {
      const date = (asString(u.startTime) ?? "").slice(0, 10);
      const usage = asNumber(u.value);
      if (!date || usage === undefined || !inRange(date, range)) continue;
      records.push({
        date,
        environmentId,
        costcenter: UNASSIGNED,
        capabilityKey: asString(u.capabilityKey) ?? "",
        capability: asString(u.capabilityName) ?? asString(u.capabilityKey) ?? "",
        usage,
        unit: asString(u.unitMeasure) ?? "",
      });
    }
  }
  return records;
}

/**
 * Billed cost per environment, day and capability key. The response is empty for subscriptions
 * without priced consumption, so the item fields are read defensively.
 */
async function environmentCost(get: ReturnType<typeof client>, base: string, range: DayRange) {
  const json = await get(`${base}/environments/cost?${rangeQuery(range)}`).catch((): Json => ({}));
  const costs = new Map<string, number>();
  for (const env of asArray(json.data)) {
    const environmentId = asString(env.environmentId) ?? "";
    for (const c of asArray(env.cost ?? env.costs)) {
      const date = (asString(c.startTime) ?? asString(c.date) ?? "").slice(0, 10);
      const value = asNumber(c.value ?? c.cost);
      const key = asString(c.capabilityKey) ?? asString(c.capability) ?? "";
      if (date && value !== undefined) {
        const id = `${environmentId}|${date}|${key}`;
        costs.set(id, (costs.get(id) ?? 0) + value);
      }
    }
  }
  return costs;
}

/** Cost center split of one environment (empty when no cost center tags are configured). */
async function costAllocation(
  get: ReturnType<typeof client>,
  subscription: string,
  environmentId: string,
  range: DayRange
) {
  const records: Json[] = [];
  let pageKey: string | undefined;
  for (let page = 0; page < 50; page++) {
    const query = pageKey
      ? `page-key=${encodeURIComponent(pageKey)}`
      : `field=COSTCENTER&environment-id=${environmentId}&from=${range.start}&to=${range.end}&page-size=1000`;
    const json = await get(`/v1/subscriptions/${subscription}/cost-allocation?${query}`);
    records.push(...asArray(json.records));
    pageKey = asString(json.nextPageKey);
    if (!pageKey || json.hasNextPage === false) break;
  }
  return records;
}

/**
 * Splits environment usage by cost center: allocated usage goes to its cost center, the remainder of
 * each environment/day/capability stays "unassigned".
 */
function applyAllocation(
  usage: AccountApiRecord[],
  allocation: Json[],
  environmentId: string,
  capabilityKeyByName: Map<string, string>
): AccountApiRecord[] {
  if (allocation.length === 0) return usage;
  const byKey = new Map(usage.map((r) => [`${r.date}|${r.capabilityKey}`, r]));
  const allocatedUsage = new Map<string, number>();
  const allocatedCost = new Map<string, number>();
  const result: AccountApiRecord[] = [];
  for (const a of allocation) {
    const date = (asString(a.date) ?? asString(a.startTime) ?? "").slice(0, 10);
    if (!date) continue;
    const capabilityName = asString(a.capability) ?? "";
    const capabilityKey = capabilityKeyByName.get(capabilityName) ?? capabilityName;
    const id = `${date}|${capabilityKey}`;
    const amount = asNumber(a.usage) ?? 0;
    const cost = asNumber(a.costs ?? a.cost);
    const base = byKey.get(id);
    allocatedUsage.set(id, (allocatedUsage.get(id) ?? 0) + amount);
    allocatedCost.set(id, (allocatedCost.get(id) ?? 0) + (cost ?? 0));
    result.push({
      date,
      environmentId,
      costcenter: asString(a.key) || UNASSIGNED,
      capabilityKey,
      capability: base?.capability ?? capabilityName,
      usage: amount,
      unit: base?.unit ?? "",
      cost,
    });
  }
  for (const r of usage) {
    const id = `${r.date}|${r.capabilityKey}`;
    const remainder = r.usage - (allocatedUsage.get(id) ?? 0);
    if (remainder <= 1e-9) continue;
    result.push({
      ...r,
      usage: remainder,
      cost: r.cost === undefined ? undefined : Math.max(0, r.cost - (allocatedCost.get(id) ?? 0)),
    });
  }
  return result;
}

export default async function (payload: Payload): Promise<AccountApiResult> {
  try {
    const connection = await readConnection().catch(() => undefined);
    if (!connection) {
      return { status: "not-configured", message: "Account connection is not configured." };
    }
    const get = client(await requestToken(connection));
    const account = `/sub/v2/accounts/${connection.accountUuid}`;

    const [environments, subscriptions] = await Promise.all([
      get(`/env/v2/accounts/${connection.accountUuid}/environments`),
      get(`${account}/subscriptions`),
    ]);
    const subscriptionList = asArray(subscriptions.data);
    const active =
      subscriptionList.find((s) => s.status === "ACTIVE") ?? subscriptionList[subscriptionList.length - 1];
    const subscriptionId = asString(active?.uuid);
    if (!subscriptionId) return { status: "error", message: "No subscription found for this account." };
    const base = `${account}/subscriptions/${subscriptionId}`;
    const detail = await get(base);

    const capabilityKeyByName = new Map(
      asArray(detail.capabilities).map((c) => [asString(c.name) ?? "", asString(c.key) ?? ""])
    );

    // Costs are calculated once a day, so stop at yesterday.
    const lastDay = day(Math.min(Date.parse(payload.to), Date.now() - DAY_MS));
    const current: DayRange = { start: day(Date.parse(payload.from)), end: lastDay };
    const previous: DayRange = {
      start: day(Date.parse(payload.prevFrom)),
      end: day(Date.parse(payload.from) - DAY_MS),
    };

    const envList = asArray(environments.data).map((e) => ({
      id: asString(e.id) ?? "",
      name: asString(e.name) ?? asString(e.id) ?? "",
      active: e.active !== false,
    }));

    const load = async (range: DayRange) => {
      const [usage, costs] = await Promise.all([
        environmentUsage(get, base, range),
        environmentCost(get, base, range),
      ]);
      const withCost = usage.map((r) => {
        const cost = costs.get(`${r.environmentId}|${r.date}|${r.capabilityKey}`);
        return cost === undefined ? r : { ...r, cost };
      });
      const environmentIds = [...new Set(withCost.map((r) => r.environmentId))];
      const split = await Promise.all(
        environmentIds.map(async (id) => {
          const ofEnvironment = withCost.filter((r) => r.environmentId === id);
          const allocation = await costAllocation(get, subscriptionId, id, range).catch(() => []);
          return applyAllocation(ofEnvironment, allocation, id, capabilityKeyByName);
        })
      );
      return { records: split.flat(), hasBilledCost: costs.size > 0 };
    };

    const [currentData, previousData] = await Promise.all([load(current), load(previous)]);
    const budget = (detail.budget ?? {}) as Json;
    const period = (detail.currentPeriod ?? {}) as Json;

    return {
      status: "ok",
      costSource: currentData.hasBilledCost ? "billed" : "usage",
      environments: envList,
      subscription: {
        name: asString(detail.name) ?? "",
        startTime: asString(detail.startTime) ?? "",
        endTime: asString(detail.endTime) ?? "",
        daysRemaining: asNumber(period.daysRemaining),
        budgetTotal: asNumber(budget.total),
        budgetUsed: asNumber(budget.used),
        currency: asString(budget.currencyCode),
      },
      current: currentData.records,
      previous: previousData.records,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) };
  }
}
