import React, { useMemo, useState } from "react";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text, TextEllipsis } from "@dynatrace/strato-components/typography";
import { DonutChart, TimeseriesChart } from "@dynatrace/strato-components/charts";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { useCostData, type CostCenterRow } from "../cost/CostDataContext";
import { CostToolbar } from "../components/CostToolbar";
import { KpiCards } from "../components/KpiCards";
import { ChangeIndicator } from "../components/ChangeIndicator";
import { CostCenterSheet } from "../components/CostCenterSheet";
import { ShareBar } from "../components/ShareBar";
import { formatCost, formatCostCompact } from "../cost/format";
import { NORMALIZED_CAPABILITIES } from "../cost/queries";

const Panel = ({ title, children }: React.PropsWithChildren<{ title: string }>) => (
  <Surface padding={16} elevation="raised">
    <Flex flexDirection="column" gap={12}>
      <Heading level={5}>{title}</Heading>
      {children}
    </Flex>
  </Surface>
);

export const Overview = () => {
  const { summary, trend, isLoading, isTrendLoading, error, source } = useCostData();

  const [selected, setSelected] = useState<string | null>(null);
  const rows = useMemo(() => summary?.rows ?? [], [summary]);

  const columns = useMemo<DataTableColumnDef<CostCenterRow>[]>(
    () => [
      {
        id: "costcenter",
        header: "Cost center",
        accessor: "costcenter",
        width: "2fr",
        cell: ({ value }) => (
          <DataTable.DefaultCell>
            <TextEllipsis truncationMode="middle">{String(value)}</TextEllipsis>
          </DataTable.DefaultCell>
        ),
      },
      {
        id: "totalCost",
        header: "Estimated cost",
        accessor: "totalCost",
        alignment: "right",
        width: 130,
        cell: ({ value }) => (
          <DataTable.DefaultCell>{formatCost(Number(value))}</DataTable.DefaultCell>
        ),
      },
      {
        id: "share",
        header: "Share of total",
        accessor: "share",
        width: "1.5fr",
        cell: ({ value }) => (
          <DataTable.DefaultCell>
            <ShareBar share={Number(value)} />
          </DataTable.DefaultCell>
        ),
      },
      {
        id: "change",
        header: "vs. previous",
        accessor: "change",
        alignment: "right",
        width: 110,
        cell: ({ rowData }) => (
          <DataTable.DefaultCell>
            <ChangeIndicator value={rowData.change} />
          </DataTable.DefaultCell>
        ),
      },
    ],
    []
  );

  const categories = useMemo(() => summary?.categories.filter((c) => c.cost > 0) ?? [], [summary]);

  return (
    <Flex flexDirection="column" gap={16} padding={24}>
      <CostToolbar title="Cost Overview" />
      {error && (
        <MessageContainer variant="critical">
          <MessageContainer.Title>Query failed</MessageContainer.Title>
          <MessageContainer.Description>{error.message}</MessageContainer.Description>
        </MessageContainer>
      )}
      <KpiCards summary={summary} />
      <Grid gridTemplateColumns="minmax(0, 2fr) minmax(0, 1fr)" gap={16}>
        <Panel title="Estimated cost trend by category">
          <TimeseriesChart data={trend ?? []} variant="bar" loading={isTrendLoading} height={300}>
            <TimeseriesChart.YAxis formatter={(value: number) => formatCostCompact(value)} />
            <TimeseriesChart.Legend position="bottom" />
            <TimeseriesChart.Tooltip variant="shared" />
          </TimeseriesChart>
        </Panel>
        <Panel title="Cost by category">
          <DonutChart
            data={categories}
            labelAccessor="category"
            valueAccessor="cost"
            unit="$"
            loading={isLoading}
            height={300}
          >
            <DonutChart.Legend position="bottom" />
          </DonutChart>
        </Panel>
      </Grid>
      <Panel title={`Cost centers (${rows.length})`}>
        <Text textStyle="small">Select a cost center to see its cost trend.</Text>
        <DataTable
          data={rows}
          columns={columns}
          loading={isLoading}
          sortable
          fullWidth
          rowId={(row) => row.costcenter}
          interactiveRows={{ autoActivate: false }}
          activeRow={selected}
          onActiveRowChange={setSelected}
          variant={{ rowDensity: "condensed" }}
        >
          <DataTable.Pagination defaultPageSize={50} pageSizeOptions={[50, 100]} />
        </DataTable>
      </Panel>
      <CostCenterSheet costcenter={selected} onClose={() => setSelected(null)} />
      {source === "grail" && (
        <Text textStyle="small">
          {NORMALIZED_CAPABILITIES.join(" and ")} show billable usage only (included volumes deducted), attributed by cost center tag.
        </Text>
      )}
    </Flex>
  );
};
