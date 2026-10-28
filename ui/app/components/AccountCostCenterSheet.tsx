import React, { useMemo } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import type { AccountCostData, AccountCostRecord } from "../account/accountData";
import { toDailyCostSeries } from "../cost/CostDataContext";
import { formatCost } from "../cost/format";
import { UNASSIGNED } from "../cost/queries";
import { ChangeIndicator } from "./ChangeIndicator";
import { CapabilityBreakdown, CostCenterStats, CostTrend, toBreakdown, toShiftedTotal } from "./CostCenterDetail";
import { ShareBar } from "./ShareBar";

export interface AccountCostCenterSelection {
  environmentId: string;
  costcenter: string;
}

interface EnvironmentRow {
  id: string;
  name: string;
  cost: number;
  change: number | null;
  share: number;
}

const environmentColumns: DataTableColumnDef<EnvironmentRow>[] = [
  { id: "name", header: "Environment", accessor: "name", width: "2fr" },
  {
    id: "cost",
    header: "Cost",
    accessor: "cost",
    alignment: "right",
    width: 110,
    cell: ({ value }) => <DataTable.DefaultCell>{formatCost(Number(value))}</DataTable.DefaultCell>,
  },
  {
    id: "share",
    header: "Share of cost center",
    accessor: "share",
    width: "1.4fr",
    cell: ({ value }) => (
      <DataTable.DefaultCell>
        <ShareBar share={Number(value)} />
      </DataTable.DefaultCell>
    ),
  },
  {
    id: "change",
    header: "vs. previous",
    accessor: (row: EnvironmentRow) => row.change ?? Number.POSITIVE_INFINITY,
    alignment: "right",
    width: 110,
    cell: ({ rowData }) => (
      <DataTable.DefaultCell>
        <ChangeIndicator value={rowData.change} />
      </DataTable.DefaultCell>
    ),
  },
];

const sum = (records: AccountCostRecord[]) => records.reduce((a, r) => a + r.cost, 0);
const changeOf = (current: number, previous: number) => (previous > 0 ? (current - previous) / previous : null);

function totalsBy(records: AccountCostRecord[], value: (r: AccountCostRecord) => number) {
  const totals: Record<string, number> = {};
  for (const r of records) totals[r.capability] = (totals[r.capability] ?? 0) + value(r);
  return totals;
}

/**
 * Detail of one cost center in one environment, from the account data (billed or estimated), plus the
 * same cost center in the other environments of the account.
 */
export const AccountCostCenterSheet = ({
  selection,
  data,
  range,
  onClose,
  onOpenEnvironment,
}: {
  selection: AccountCostCenterSelection | null;
  data: AccountCostData | undefined;
  range: { prevFrom: string; from: string };
  onClose: () => void;
  onOpenEnvironment: (environmentId: string) => void;
}) => {
  const detail = useMemo(() => {
    if (!selection || !data) return undefined;
    const { environmentId, costcenter } = selection;
    const ofCenter = (records: AccountCostRecord[]) => records.filter((r) => r.costcenter === costcenter);
    const centerCurrent = ofCenter(data.current);
    const centerPrevious = ofCenter(data.previous);
    const current = centerCurrent.filter((r) => r.environmentId === environmentId);
    const previous = centerPrevious.filter((r) => r.environmentId === environmentId);
    const cost = sum(current);
    const previousCost = sum(previous);
    const accountTotal = sum(data.current);
    const centerTotal = sum(centerCurrent);

    const environments = data.environments
      .map((env) => {
        const envCost = sum(centerCurrent.filter((r) => r.environmentId === env.id));
        const envPrevious = sum(centerPrevious.filter((r) => r.environmentId === env.id));
        return {
          id: env.id,
          name: env.name,
          cost: envCost,
          change: changeOf(envCost, envPrevious),
          share: centerTotal > 0 ? envCost / centerTotal : 0,
        };
      })
      .filter((row) => row.cost > 0)
      .sort((a, b) => b.cost - a.cost);

    return {
      environmentName: data.environments.find((e) => e.id === environmentId)?.name ?? environmentId,
      cost,
      previousCost,
      change: changeOf(cost, previousCost),
      share: accountTotal > 0 ? cost / accountTotal : 0,
      series: toDailyCostSeries(current, "capability"),
      previousTotal: toShiftedTotal(
        toDailyCostSeries(previous, "capability"),
        Date.parse(range.from) - Date.parse(range.prevFrom)
      ),
      breakdown: toBreakdown(
        totalsBy(current, (r) => r.cost),
        totalsBy(current, (r) => r.usage)
      ),
      centerTotal,
      environments,
    };
  }, [selection, data, range.from, range.prevFrom]);

  const costLabel = data?.source === "estimated" ? "Estimated cost" : "Billed cost";
  const costcenter = selection?.costcenter ?? "";

  return (
    <Sheet
      title={detail ? `${costcenter} · ${detail.environmentName}` : costcenter}
      show={selection !== null}
      onDismiss={onClose}
      actions={
        <Flex gap={8}>
          {selection && (
            <Button onClick={() => onOpenEnvironment(selection.environmentId)}>Open in Overview</Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={16}>
        {costcenter === UNASSIGNED && (
          <MessageContainer variant="neutral">
            <MessageContainer.Description>Usage that is not allocated to a cost center.</MessageContainer.Description>
          </MessageContainer>
        )}
        <CostCenterStats
          costLabel={costLabel}
          cost={detail?.cost}
          previousCost={detail?.previousCost}
          change={detail?.change}
          share={detail?.share}
          shareLabel="Share of account"
        />
        <CostTrend
          title={`Daily ${costLabel.toLowerCase()} by capability`}
          series={detail?.series ?? []}
          previous={detail?.previousTotal}
          loading={!detail}
        />
        <CapabilityBreakdown rows={detail?.breakdown ?? []} costLabel={costLabel} />
        {detail && detail.environments.length > 1 && (
          <Flex flexDirection="column" gap={8}>
            <Heading level={5}>{costcenter} across environments</Heading>
            <Text textStyle="small">
              {formatCost(detail.centerTotal)} in {detail.environments.length} environments of the account.
            </Text>
            <DataTable
              data={detail.environments}
              columns={environmentColumns}
              sortable
              fullWidth
              variant={{ rowDensity: "condensed" }}
            />
          </Flex>
        )}
      </Flex>
    </Sheet>
  );
};
