import { useMemo } from "react";
import { useAppFunction } from "@dynatrace-sdk/react-hooks";
import type { Rates } from "../cost/rateCard";
import { fromApi, type AccountApiResult } from "./accountApi";
import { demoAccountCost, type AccountCostData } from "./accountData";

export interface AccountConnectionStatus {
  status: "ok" | "not-configured" | "error" | "loading";
  message?: string;
}

export interface AccountCostResult {
  /** Real data when connected, otherwise example data (`source: "demo"`). */
  data: AccountCostData | undefined;
  connection: AccountConnectionStatus;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Account-wide cost via the "account-cost" app function. Falls back to demo data when the connection
 * is not configured or the request fails, so the account views always have something to show.
 */
export function useAccountCost(
  range: { prevFrom: string; from: string; to: string },
  enabled: boolean,
  rates: Rates,
  currentEnvironmentId: string
): AccountCostResult {
  const response = useAppFunction<AccountApiResult>(
    { name: "account-cost", data: { prevFrom: range.prevFrom, from: range.from, to: range.to } },
    { autoFetch: enabled, autoFetchOnUpdate: enabled }
  );

  const connection: AccountConnectionStatus = response.isLoading
    ? { status: "loading" }
    : response.error
      ? { status: "error", message: response.error.message }
      : response.data
        ? { status: response.data.status, message: response.data.message }
        : { status: "not-configured" };

  const data = useMemo(() => {
    if (!enabled || response.isLoading) return undefined;
    if (response.data?.status === "ok") return fromApi(response.data, rates, currentEnvironmentId);
    return demoAccountCost(range.from, range.to);
  }, [enabled, response.isLoading, response.data, rates, currentEnvironmentId, range.from, range.to]);

  return {
    data,
    connection,
    isLoading: enabled && response.isLoading,
    refetch: () => void response.refetch(),
  };
}
