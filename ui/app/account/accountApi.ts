import type { Rates } from "../cost/rateCard";
import type { AccountCostData, AccountCostRecord } from "./accountData";

/** Response of api/account-cost.function.ts (kept in sync by hand; the function is bundled separately). */
export interface AccountApiRecord {
  date: string;
  environmentId: string;
  costcenter: string;
  capabilityKey: string;
  capability: string;
  usage: number;
  unit: string;
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

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Converts the function result into AccountCostData. Records without a billed cost are priced with
 * the rate card (custom prices included), matched by capability name, then by capability key.
 */
export function fromApi(result: AccountApiResult, rates: Rates, currentEnvironmentId: string): AccountCostData {
  const byKey = new Map([...rates.values()].map((rate) => [rate.key, rate]));
  const toRecord = (r: AccountApiRecord): AccountCostRecord => {
    const rate = rates.get(r.capability) ?? byKey.get(r.capabilityKey);
    return {
      date: r.date,
      environmentId: r.environmentId,
      costcenter: r.costcenter,
      // Use the rate card name so categories and units match the rest of the app.
      capability: rate?.name ?? r.capability,
      usage: r.usage,
      cost: r.cost ?? (rate ? (r.usage * rate.price) / rate.priceUnit : 0),
    };
  };
  const current = (result.current ?? []).map(toRecord);
  const previous = (result.previous ?? []).map(toRecord);

  // Environments without usage in the period are left out to keep the views focused.
  const withUsage = new Set([...current, ...previous].map((r) => r.environmentId));
  const environments = (result.environments ?? [])
    .filter((e) => withUsage.has(e.id) || e.id === currentEnvironmentId)
    .map((e) => ({
      id: e.id,
      name: e.name && e.name !== e.id ? `${e.name} (${e.id})` : e.id,
      isCurrent: e.id === currentEnvironmentId,
    }));
  // Usage of environments that are missing from the environment list is still shown.
  for (const id of withUsage) {
    if (!environments.some((e) => e.id === id)) environments.push({ id, name: id, isCurrent: id === currentEnvironmentId });
  }

  const subscription = result.subscription;
  const end = subscription?.endTime ?? "";
  const budgetTotal = subscription?.budgetTotal ?? 0;
  return {
    source: result.costSource === "billed" ? "billed" : "estimated",
    currency: subscription?.currency ?? "USD",
    budget: budgetTotal > 0 ? { total: budgetTotal, used: subscription?.budgetUsed ?? 0 } : undefined,
    period: {
      start: subscription?.startTime ?? "",
      end,
      daysRemaining:
        subscription?.daysRemaining ?? (end ? Math.max(0, Math.ceil((Date.parse(end) - Date.now()) / DAY_MS)) : 0),
    },
    environments,
    current,
    previous,
  };
}
