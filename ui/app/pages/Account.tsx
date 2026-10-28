import React, { useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { SettingIcon } from "@dynatrace/strato-icons";
import { useNavigate } from "react-router-dom";
import { DonutChart, TimeseriesChart, type Timeseries } from "@dynatrace/strato-components/charts";
import { MessageContainer, ProgressBar, SkeletonText } from "@dynatrace/strato-components/content";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Text, TextEllipsis } from "@dynatrace/strato-components/typography";
import type { AccountCostData, AccountCostRecord } from "../account/accountData";
import { AccountCostCenterSheet, type AccountCostCenterSelection } from "../components/AccountCostCenterSheet";
import { ConnectionSheet } from "../components/ConnectionSheet";
import { ChangeIndicator } from "../components/ChangeIndicator";
import { CostToolbar } from "../components/CostToolbar";
import { ShareBar } from "../components/ShareBar";
import { useCostData } from "../cost/CostDataContext";
import { formatCost, formatCostCompact, formatPercent } from "../cost/format";

const DAY_MS = 24 * 60 * 60 * 1000;

interface AccountRow {
  id: string;
  name: string;
  isEnvironment: boolean;
  isCurrent: boolean;
  /** Environment the row belongs to (the environment itself for environment rows). */
  environmentId: string;
  cost: number;
  previousCost: number;
  change: number | null;
  share: number;
  topCapability: string;
  children?: AccountRow[];
}

const sumBy = (records: AccountCostRecord[], key: (r: AccountCostRecord) => string) => {
  const totals = new Map<string, number>();
  for (const r of records) totals.set(key(r), (totals.get(key(r)) ?? 0) + r.cost);
  return totals;
};

const changeOf = (current: number, previous: number) =>
  previous > 0 ? (current - previous) / previous : null;

const topOf = (totals: Map<string, number>) =>
  [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "–";

function buildRows(data: AccountCostData, total: number): AccountRow[] {
  return data.environments
    .map((env) => {
      const current = data.current.filter((r) => r.environmentId === env.id);
      const previous = data.previous.filter((r) => r.environmentId === env.id);
      const costByCenter = sumBy(current, (r) => r.costcenter);
      const previousByCenter = sumBy(previous, (r) => r.costcenter);
      const cost = [...costByCenter.values()].reduce((a, b) => a + b, 0);
      const previousCost = [...previousByCenter.values()].reduce((a, b) => a + b, 0);
      const children = [...costByCenter.entries()]
        .map(([costcenter, centerCost]) => ({
          id: `${env.id}/${costcenter}`,
          name: costcenter,
          isEnvironment: false,
          isCurrent: false,
          environmentId: env.id,
          cost: centerCost,
          previousCost: previousByCenter.get(costcenter) ?? 0,
          change: changeOf(centerCost, previousByCenter.get(costcenter) ?? 0),
          share: total > 0 ? centerCost / total : 0,
          topCapability: topOf(
            sumBy(
              current.filter((r) => r.costcenter === costcenter),
              (r) => r.capability
            )
          ),
        }))
        .sort((a, b) => b.cost - a.cost);
      return {
        id: env.id,
        name: env.name,
        isEnvironment: true,
        isCurrent: env.isCurrent,
        environmentId: env.id,
        cost,
        previousCost,
        change: changeOf(cost, previousCost),
        share: total > 0 ? cost / total : 0,
        topCapability: topOf(sumBy(current, (r) => r.capability)),
        children,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

function buildTrend(data: AccountCostData): Timeseries[] {
  const days = [...new Set(data.current.map((r) => r.date))].sort();
  return data.environments.map((env) => {
    const byDay = sumBy(
      data.current.filter((r) => r.environmentId === env.id),
      (r) => r.date
    );
    return {
      name: env.name,
      unit: "USD",
      datapoints: days.map((day) => {
        const start = new Date(`${day}T00:00:00Z`);
        return { start, end: new Date(start.getTime() + DAY_MS), value: byDay.get(day) ?? 0 };
      }),
    };
  });
}

const Kpi = ({ label, children, footer }: React.PropsWithChildren<{ label: string; footer?: React.ReactNode }>) => (
  <Surface padding={16} elevation="raised">
    <Flex flexDirection="column" gap={8}>
      <Text textStyle="small-emphasized">{label}</Text>
      {children}
      {footer}
    </Flex>
  </Surface>
);

const Panel = ({ title, children }: React.PropsWithChildren<{ title: string }>) => (
  <Surface padding={16} elevation="raised">
    <Flex flexDirection="column" gap={12}>
      <Heading level={5}>{title}</Heading>
      {children}
    </Flex>
  </Surface>
);

const columns: DataTableColumnDef<AccountRow>[] = [
  {
    id: "name",
    header: "Environment / Cost center",
    accessor: "name",
    width: "2fr",
    cell: ({ rowData }) => (
      <DataTable.DefaultCell>
        <Flex gap={8} alignItems="center" style={{ minWidth: 0 }}>
          <Text textStyle={rowData.isEnvironment ? "base-emphasized" : "base"} style={{ minWidth: 0 }}>
            <TextEllipsis>{rowData.name}</TextEllipsis>
          </Text>
        </Flex>
      </DataTable.DefaultCell>
    ),
  },
  {
    id: "cost",
    header: "Cost",
    accessor: "cost",
    alignment: "right",
    width: 130,
    cell: ({ value }) => <DataTable.DefaultCell>{formatCost(Number(value))}</DataTable.DefaultCell>,
  },
  {
    id: "share",
    header: "Share of account",
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
    accessor: (row: AccountRow) => row.change ?? Number.POSITIVE_INFINITY,
    alignment: "right",
    width: 110,
    cell: ({ rowData }) => (
      <DataTable.DefaultCell>
        <ChangeIndicator value={rowData.change} />
      </DataTable.DefaultCell>
    ),
  },
  { id: "topCapability", header: "Top capability", accessor: "topCapability", width: "1.6fr" },
];

export const Account = () => {
  const { account, range } = useCostData();
  const { data, connection, refetch } = account;
  const navigate = useNavigate();
  const [showConnection, setShowConnection] = useState(false);
  const [selected, setSelected] = useState<AccountCostCenterSelection | null>(null);
  const { total, previousTotal, rows, trend, byEnvironment } = useMemo(() => {
    if (!data) return { total: 0, previousTotal: 0, rows: [], trend: [], byEnvironment: [] };
    const sum = (records: AccountCostRecord[]) => records.reduce((a, r) => a + r.cost, 0);
    const currentTotal = sum(data.current);
    const builtRows = buildRows(data, currentTotal);
    return {
      total: currentTotal,
      previousTotal: sum(data.previous),
      rows: builtRows,
      trend: buildTrend(data),
      byEnvironment: builtRows.map((row) => ({ environment: row.name, cost: row.cost })),
    };
  }, [data]);

  const rowsById = useMemo(
    () => new Map(rows.flatMap((row) => [row, ...(row.children ?? [])]).map((row) => [row.id, row])),
    [rows]
  );

  /** Opens the environment on the Overview page. */
  const openEnvironment = (environmentId: string) => {
    const environment = data?.environments.find((e) => e.id === environmentId);
    navigate(environment?.isCurrent ? "/" : `/?tenant=${encodeURIComponent(environmentId)}`);
  };

  /** Environment rows open the environment, cost center rows open their detail sheet. */
  const selectRow = (rowId: string | null) => {
    const row = rowId ? rowsById.get(rowId) : undefined;
    if (!row) return;
    if (row.isEnvironment) openEnvironment(row.environmentId);
    else setSelected({ environmentId: row.environmentId, costcenter: row.name });
  };

  const budget = data?.budget;
  const budgetUsed = budget ? budget.used / budget.total : 0;
  const isEstimated = data?.source === "estimated";
  const costLabel = isEstimated ? "Estimated cost" : "Billed cost";

  const connectionStatus =
    connection.status === "ok" ? (
      <MessageContainer variant="success">
        <MessageContainer.Title>Connected</MessageContainer.Title>
        <MessageContainer.Description>
          {data?.environments.length ?? 0} environments ·{" "}
          {isEstimated ? "cost estimated from billed usage and the rate card" : "billed cost"}
        </MessageContainer.Description>
      </MessageContainer>
    ) : connection.status === "error" ? (
      <MessageContainer variant="critical">
        <MessageContainer.Title>Connection failed — example data is shown</MessageContainer.Title>
        <MessageContainer.Description>{connection.message}</MessageContainer.Description>
      </MessageContainer>
    ) : connection.status === "not-configured" ? (
      <MessageContainer variant="neutral">
        <MessageContainer.Description>Not configured — example data is shown.</MessageContainer.Description>
      </MessageContainer>
    ) : undefined;

  return (
    <Flex flexDirection="column" gap={16} padding={24}>
      <CostToolbar
        title="Account Cost"
        subtitle={`${isEstimated ? "Billed usage × rate card" : "Billed cost"} of all environments (USD) · excludes last 24h`}
        groupBy={null}
        showTenant={false}
        actions={
          <Button onClick={() => setShowConnection(true)}>
            <Button.Prefix>
              <SettingIcon />
            </Button.Prefix>
            Connection
          </Button>
        }
      />
      <ConnectionSheet
        show={showConnection}
        onClose={() => setShowConnection(false)}
        onSaved={refetch}
        status={connectionStatus}
      />
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={16}>
        <Kpi
          label={`Account ${costLabel.toLowerCase()}`}
          footer={
            data && (
              <Flex gap={4} alignItems="center">
                <ChangeIndicator value={changeOf(total, previousTotal)} />
                <Text textStyle="small">vs. previous period</Text>
              </Flex>
            )
          }
        >
          {data ? <Heading level={2}>{formatCost(total)}</Heading> : <SkeletonText lines={1} />}
        </Kpi>
        <Kpi label="Environments" footer={<Text textStyle="small">With usage in this period</Text>}>
          {data ? <Heading level={2}>{data.environments.length}</Heading> : <SkeletonText lines={1} />}
        </Kpi>
        <Kpi
          label="Budget used"
          footer={
            data && (
              <Text textStyle="small">
                {budget
                  ? `${formatCostCompact(budget.used)} of ${formatCostCompact(budget.total)}`
                  : "No commit defined for this subscription"}
              </Text>
            )
          }
        >
          {data && !budget ? (
            <Heading level={2}>–</Heading>
          ) : data ? (
            <ProgressBar
              value={budgetUsed * 100}
              color={budgetUsed < 0.8 ? "primary" : budgetUsed < 1 ? "warning" : "critical"}
              aria-label="Budget used"
            >
              <ProgressBar.Value>{formatPercent(budgetUsed)}</ProgressBar.Value>
            </ProgressBar>
          ) : (
            <SkeletonText lines={1} />
          )}
        </Kpi>
        <Kpi label="Days remaining" footer={<Text textStyle="small">In the current commit period</Text>}>
          {data ? <Heading level={2}>{data.period.daysRemaining}</Heading> : <SkeletonText lines={1} />}
        </Kpi>
      </Grid>
      <Grid gridTemplateColumns="minmax(0, 2fr) minmax(0, 1fr)" gap={16}>
        <Panel title={`Daily ${costLabel.toLowerCase()} by environment`}>
          <TimeseriesChart data={trend} variant="bar" loading={!data} height={300}>
            <TimeseriesChart.YAxis formatter={(value: number) => formatCostCompact(value)} />
            <TimeseriesChart.Legend position="bottom" />
            <TimeseriesChart.Tooltip variant="shared" />
          </TimeseriesChart>
        </Panel>
        <Panel title="Cost by environment">
          <DonutChart
            data={byEnvironment}
            labelAccessor="environment"
            valueAccessor="cost"
            unit="$"
            loading={!data}
            height={300}
          >
            <DonutChart.Legend position="bottom" />
          </DonutChart>
        </Panel>
      </Grid>
      <Panel title="Environments and cost centers">
        <Text textStyle="small">
          Expand an environment to see its cost centers (dt.cost.costcenter tag). Select an environment to
          open it on the Overview and Usage Attribution pages, or a cost center to see its details.
        </Text>
        <DataTable
          data={rows}
          columns={columns}
          loading={!data}
          rowId={(row) => row.id}
          subRows={{ accessor: (row) => row.children }}
          interactiveRows={{ autoActivate: false }}
          activeRow={null}
          onActiveRowChange={selectRow}
          sortable
          fullWidth
          variant={{ rowDensity: "condensed", verticalAlignment: "center" }}
        />
      </Panel>
      <AccountCostCenterSheet
        selection={selected}
        data={data}
        range={range}
        onClose={() => setSelected(null)}
        onOpenEnvironment={openEnvironment}
      />
    </Flex>
  );
};
