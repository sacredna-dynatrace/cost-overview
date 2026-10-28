import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { appSettingsObjectsClient } from "@dynatrace-sdk/client-app-settings-v2";
import { buildRates, LIST_RATES, type PriceOverride, type Rates } from "../cost/rateCard";

/** Schema IDs of settings/schemas/*.schema.json. */
export const RATE_CARD_SCHEMA = "rate-card";
export const ACCOUNT_CONNECTION_SCHEMA = "account-connection";

interface AppSettingsContextValue {
  /**
   * Admins are users with write access to the "account-connection" settings schema,
   * granted by an IAM policy to the admin group.
   */
  isAdmin: boolean;
  isAdminResolved: boolean;
  /** Effective prices: list prices with the saved overrides applied. */
  rates: Rates;
  overrides: PriceOverride[];
  isRateCardLoading: boolean;
  /** Set when the rate card could not be read; list prices are used instead. */
  rateCardError: string | undefined;
  saveOverrides: (overrides: PriceOverride[]) => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextValue | undefined>(undefined);

interface StoredRateCard {
  objectId: string;
  version: string;
}

export const AppSettingsProvider = ({ children }: React.PropsWithChildren) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminResolved, setIsAdminResolved] = useState(false);
  const [overrides, setOverrides] = useState<PriceOverride[]>([]);
  const [stored, setStored] = useState<StoredRateCard | undefined>();
  const [isRateCardLoading, setIsRateCardLoading] = useState(true);
  const [rateCardError, setRateCardError] = useState<string | undefined>();

  useEffect(() => {
    appSettingsObjectsClient
      .resolveEffectivePermissions({
        body: {
          permissions: [
            {
              permission: "app-settings:objects:write",
              context: { schemaId: ACCOUNT_CONNECTION_SCHEMA },
            },
          ],
        },
      })
      .then((permissions) => setIsAdmin(permissions.some((p) => p.granted === "true")))
      // Missing schema (app not deployed) or no access: treat as non-admin.
      .catch(() => setIsAdmin(false))
      .finally(() => setIsAdminResolved(true));
  }, []);

  useEffect(() => {
    appSettingsObjectsClient
      .getAppSettingsObjects({ schemaId: RATE_CARD_SCHEMA, addFields: "value" })
      .then(({ items }) => {
        // "multiObject": false — at most one object exists.
        const [object] = items;
        if (object) {
          const value = object.value as { prices?: PriceOverride[] } | undefined;
          setOverrides(value?.prices ?? []);
          setStored({ objectId: object.objectId, version: object.version });
        }
      })
      .catch((error: unknown) =>
        setRateCardError(error instanceof Error ? error.message : String(error))
      )
      .finally(() => setIsRateCardLoading(false));
  }, []);

  const saveOverrides = useCallback(
    async (next: PriceOverride[]) => {
      const value = { prices: next };
      if (stored) {
        const updated = await appSettingsObjectsClient.putAppSettingsObjectByObjectId({
          objectId: stored.objectId,
          optimisticLockingVersion: stored.version,
          body: { value },
        });
        setStored({ objectId: stored.objectId, version: updated.version });
      } else {
        const created = await appSettingsObjectsClient.postAppSettingsObject({
          body: { schemaId: RATE_CARD_SCHEMA, value },
        });
        if (created) setStored({ objectId: created.objectId, version: created.version });
      }
      setOverrides(next);
      setRateCardError(undefined);
    },
    [stored]
  );

  const rates = useMemo(
    () => (rateCardError ? LIST_RATES : buildRates(overrides)),
    [overrides, rateCardError]
  );

  const value: AppSettingsContextValue = {
    isAdmin,
    isAdminResolved,
    rates,
    overrides,
    isRateCardLoading,
    rateCardError,
    saveOverrides,
  };

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
};

export function useAppSettings(): AppSettingsContextValue {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error("useAppSettings must be used within an AppSettingsProvider");
  }
  return context;
}
