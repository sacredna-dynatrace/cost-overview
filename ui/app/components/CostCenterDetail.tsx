import React, { useMemo } from "react";
import { TimeseriesChart, type Timeseries } from "@dynatrace/strato-components/charts";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { formatCost, formatCostCompact, formatPercent, formatUsage } from "../cost/format";
import { getRate } from "../cost/rateCard";
import { ChangeIndicator } from "./ChangeIndicator";

/** Shared building blocks of the cost center detail sheets (tenant and account views). */

export interface BreakdownRow {
  capability: string;
  usage: number;
  unitName: string;
  cost: number;
  share: number;
}

/** Capability rows sorted by cost, from cost and usage totals keyed by capability. */
export function toBreakdown(cost: Record<string, number>, usage: Record<string, number>): BreakdownRow[] {
  const total = Object.values(cost).reduce((a, b) => a + b, 0);
  return Object.entries(cost)
    .map(([capability, value]) => ({
      capability,
      cost: value,
      usage: usage[capability] ?? 0,
      unitName: getRate(capability)?.unitName ?? "",
      share: total > 0 ? value / total : 0,
    }))
    .sort((a, b) => b.cost - a.cost);
}

/** Sums all series into one total series, shifted forward by `shiftMs` to overlay the current period. */
export function toShiftedTotal(series: Timeseries[], shiftMs: number): Timeseries | undefined {
  const [first] = series;
  if (!first) return undefined;
  return {
    name: "Previous period (total)",
    unit: "USD",
    datapoints: first.datapoints.map((point, i) => ({
      start: new Date(point.start.getTime() + shiftMs),
      end: point.end && new Date(point.end.getTime() + shiftMs),
      value: series.reduce((sum, s) => sum + (s.datapoints[i]?.value ?? 0), 0),
    })),
  };
}

export const Stat = ({ label, children }: React.PropsWithChildren<{ label: string }>) => (
  <Surface padding={12}>
    <Flex flexDirection="column" gap={4}>
      <Text textStyle="small-emphasized">{label}</Text>
      {children}
    </Flex>
  </Surface>
);

export const CostCenterStats = ({
  costLabel,
  cost,
  previousCost,
  change,
  share,
  shareLabel,
}: {
  costLabel: string;
  cost?: number;
  previousCost?: number;
  change?: number | null;
  share?: number;
  shareLabel: string;
}) => (
  <Grid gridTemplateColumns="repeat(3, minmax(0, 1fr))" gap={12}>
    <Stat label={costLabel}>
      <Heading level={3}>{cost !== undefined ? formatCost(cost) : "–"}</Heading>
    </Stat>
    <Stat label="vs. previous period">
      <Flex gap={8} alignItems="baseline">
        <Heading level={3}>{previousCost !== undefined ? formatCost(previousCost) : "–"}</Heading>
        {change !== undefined && <ChangeIndicator value={change} />}
      </Flex>
    </Stat>
    <Stat label={shareLabel}>
      <Heading level={3}>{share !== undefined ? formatPercent(share) : "–"}</Heading>
    </Stat>
  </Grid>
);

export const CostTrend = ({
  title,
  series,
  previous,
  loading,
  error,
}: {
  title: string;
  series: Timeseries[];
  previous?: Timeseries;
  loading: boolean;
  error?: string;
}) => (
  <Flex flexDirection="column" gap={8}>
    <Heading level={5}>{title}</Heading>
    <Text textStyle="small">The line shows the total of the previous period, aligned to the current one.</Text>
    {error ? (
      <MessageContainer variant="critical">
        <MessageContainer.Title>Query failed</MessageContainer.Title>
        <MessageContainer.Description>{error}</MessageContainer.Description>
      </MessageContainer>
    ) : (
      <TimeseriesChart data={series} variant="bar" loading={loading} height={280}>
        {previous && <TimeseriesChart.Line data={previous} color={Colors.Charts.Categorical.Color02.Default} />}
        <TimeseriesChart.YAxis formatter={(value: number) => formatCostCompact(value)} />
        <TimeseriesChart.Legend position="bottom" />
        <TimeseriesChart.Tooltip variant="shared" />
      </TimeseriesChart>
    )}
  </Flex>
);

const breakdownColumns = (costLabel: string): DataTableColumnDef<BreakdownRow>[] => [
  { id: "capability", header: "Capability", accessor: "capability", width: "2fr" },
  {
    id: "usage",
    header: "Usage",
    accessor: "usage",
    alignment: "right",
    width: "1.2fr",
    cell: ({ rowData }) => (
      <DataTable.DefaultCell>
        {formatUsage(rowData.usage)} {rowData.unitName}
      </DataTable.DefaultCell>
    ),
  },
  {
    id: "cost",
    header: costLabel,
    accessor: "cost",
    alignment: "right",
    width: "1fr",
    cell: ({ value }) => <DataTable.DefaultCell>{formatCost(Number(value))}</DataTable.DefaultCell>,
  },
  {
    id: "share",
    header: "Share",
    accessor: "share",
    alignment: "right",
    width: 80,
    cell: ({ value }) => <DataTable.DefaultCell>{formatPercent(Number(value))}</DataTable.DefaultCell>,
  },
];

export const CapabilityBreakdown = ({ rows, costLabel }: { rows: BreakdownRow[]; costLabel: string }) => {
  const columns = useMemo(() => breakdownColumns(costLabel), [costLabel]);
  return (
    <Flex flexDirection="column" gap={8}>
      <Heading level={5}>Cost by capability</Heading>
      <DataTable data={rows} columns={columns} sortable fullWidth variant={{ rowDensity: "condensed" }} />
    </Flex>
  );
};
