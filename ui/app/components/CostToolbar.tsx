import React from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { TimeframeSelector } from "@dynatrace/strato-components/filters";
import { Select } from "@dynatrace/strato-components/forms";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Chip } from "@dynatrace/strato-components/content";
import { RefreshIcon } from "@dynatrace/strato-icons";
import { useCostData } from "../cost/CostDataContext";

export const CostToolbar = ({
  title,
  subtitle,
  groupBy = "Cost center",
  showTenant = true,
  actions,
}: {
  title: string;
  /** Defaults to a description of the selected environment's data source. */
  subtitle?: string;
  /** Grouping shown as a chip; omitted when `null`. */
  groupBy?: string | null;
  /** Show the environment selector (admins only). */
  showTenant?: boolean;
  /** Extra controls rendered before the timeframe selector. */
  actions?: React.ReactNode;
}) => {
  const { timeframe, setTimeframe, refetch, isLoading, tenant, tenants, setTenant, source, account } =
    useCostData();
  const isBilled = source === "account";
  const accountDescription =
    account.data?.source === "estimated"
      ? "Billed usage × rate card (USD) · daily · excludes last 24h"
      : "Billed cost (USD) · daily · excludes last 24h";
  const description =
    subtitle ?? (isBilled ? accountDescription : "Estimated at DPS list prices (USD)");
  return (
    <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={16}>
      <Flex alignItems="baseline" gap={12}>
        <Heading level={1}>{title}</Heading>
        <Text textStyle="small">{description}</Text>
      </Flex>
      <Flex alignItems="center" gap={8} flexWrap="wrap">
        {showTenant && tenants.length > 0 && (
          <Select
            value={tenant.id}
            onChange={(id) => id && setTenant(id)}
            aria-label="Environment"
          >
            <Select.Content>
              {tenants.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name}
                </Select.Option>
              ))}
            </Select.Content>
          </Select>
        )}
        {groupBy && (
          <Chip>
            Group by: {groupBy}
            {isBilled ? " (tag)" : ""}
          </Chip>
        )}
        {actions}
        <TimeframeSelector
          value={timeframe}
          onChange={(value) => value && setTimeframe(value)}
        />
        <Button onClick={refetch} disabled={isLoading} aria-label="Refresh">
          <Button.Prefix>
            <RefreshIcon />
          </Button.Prefix>
        </Button>
      </Flex>
    </Flex>
  );
};
