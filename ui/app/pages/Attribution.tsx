import React, { useMemo, useState } from "react";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Text, TextEllipsis } from "@dynatrace/strato-components/typography";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { SearchInput, ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCostData, type CapabilityTotal, type CostCenterRow } from "../cost/CostDataContext";
import { CostToolbar } from "../components/CostToolbar";
import { ChangeIndicator } from "../components/ChangeIndicator";
import { CostCenterSheet } from "../components/CostCenterSheet";
import { formatCost, formatCostCompact, formatPercent, formatUsage } from "../cost/format";

type Measure = "cost" | "usage";
type Display = "value" | "percent";
type CellStyle = "heatmap" | "bars";

const ACCENT = Colors.Charts.Categorical.Color01.Default;

const formatValue = (value: number, measure: Measure, display: Display) => {
  if (display === "percent") return formatPercent(value);
  return measure === "cost" ? formatCostCompact(value) : formatUsage(value);
};

/** Column-relative intensity; sqrt spreads small values so they stay visible next to large ones. */
const intensity = (value: number, max: number) => (max > 0 ? Math.sqrt(value / max) : 0);

const MetricCell = ({
  value,
  max,
  measure,
  display,
  cellStyle,
}: {
  value: number;
  max: number;
  measure: Measure;
  display: Display;
  cellStyle: CellStyle;
}) => {
  if (value <= 0) {
    return (
      <DataTable.DefaultCell>
        <Text style={{ color: Colors.Text.Neutral.Disabled }}>–</Text>
      </DataTable.DefaultCell>
    );
  }
  const level = intensity(value, max);
  const label = formatValue(value, measure, display);
  if (cellStyle === "heatmap") {
    return (
      <DataTable.DefaultCell
        style={{
          background: `color-mix(in srgb, ${ACCENT} ${Math.round(8 + level * 52)}%, transparent)`,
          textAlign: "right",
        }}
      >
        {label}
      </DataTable.DefaultCell>
    );
  }
  return (
    <DataTable.DefaultCell>
      <Flex alignItems="center" gap={8} justifyContent="flex-end">
        <Text>{label}</Text>
        <div
          style={{
            width: 48,
            height: 8,
            borderRadius: 4,
            flexShrink: 0,
            background: Colors.Background.Container.Neutral.Default,
          }}
        >
          <div
            style={{
              width: `${Math.max(level * 100, 4)}%`,
              height: "100%",
              borderRadius: 4,
              background: ACCENT,
            }}
          />
        </div>
      </Flex>
    </DataTable.DefaultCell>
  );
};

const CapabilityHeader = ({
  capability,
  measure,
  display,
}: {
  capability: CapabilityTotal;
  measure: Measure;
  display: Display;
}) => {
  let total: string;
  if (display === "percent") total = "100%";
  else if (measure === "cost") total = formatCostCompact(capability.cost);
  else total = `${formatUsage(capability.usage)} ${capability.unitName}`;
  return (
    <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
      <TextEllipsis>{capability.capability}</TextEllipsis>
      <Text textStyle="small" style={{ color: Colors.Text.Neutral.Subdued }}>
        Σ {total}
      </Text>
    </Flex>
  );
};

export const Attribution = () => {
  const { summary, isLoading, error } = useCostData();
  const [measure, setMeasure] = useState<Measure>("cost");
  const [display, setDisplay] = useState<Display>("value");
  const [cellStyle, setCellStyle] = useState<CellStyle>("heatmap");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const capabilities = useMemo(
    () => (summary?.capabilities ?? []).filter((c) => (measure === "cost" ? c.cost > 0 : c.usage > 0)),
    [summary, measure]
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = summary?.rows ?? [];
    return term ? all.filter((row) => row.costcenter.toLowerCase().includes(term)) : all;
  }, [summary, search]);

  const columns = useMemo<DataTableColumnDef<CostCenterRow>[]>(() => {
    const valueOf = (row: CostCenterRow, capability: CapabilityTotal) => {
      const raw = (measure === "cost" ? row.cost : row.usage)[capability.capability] ?? 0;
      if (display === "value") return raw;
      const total = measure === "cost" ? capability.cost : capability.usage;
      return total > 0 ? raw / total : 0;
    };

    const capabilityColumns: DataTableColumnDef<CostCenterRow>[] = capabilities.map((capability) => {
      const max = Math.max(0, ...(summary?.rows ?? []).map((row) => valueOf(row, capability)));
      return {
        id: capability.capability,
        label: capability.capability,
        header: () => <CapabilityHeader capability={capability} measure={measure} display={display} />,
        accessor: (row: CostCenterRow) => valueOf(row, capability),
        alignment: "right",
        width: 170,
        cell: ({ value }) => (
          <MetricCell value={Number(value)} max={max} measure={measure} display={display} cellStyle={cellStyle} />
        ),
      };
    });

    return [
      {
        id: "costcenter",
        header: "Cost center",
        accessor: "costcenter",
        width: 280,
        cell: ({ value }) => (
          <DataTable.DefaultCell>
            <TextEllipsis truncationMode="middle">{String(value)}</TextEllipsis>
          </DataTable.DefaultCell>
        ),
      },
      {
        id: "totalCost",
        header: "Total cost",
        accessor: (row: CostCenterRow) => (display === "percent" ? row.share : row.totalCost),
        alignment: "right",
        width: 120,
        cell: ({ value }) => (
          <DataTable.DefaultCell>
            <Text textStyle="base-emphasized">
              {display === "percent" ? formatPercent(Number(value)) : formatCost(Number(value))}
            </Text>
          </DataTable.DefaultCell>
        ),
      },
      {
        id: "change",
        header: "vs. previous",
        accessor: (row: CostCenterRow) => row.change ?? Number.POSITIVE_INFINITY,
        alignment: "right",
        width: 110,
        cell: ({ rowData }) => (
          <DataTable.DefaultCell>
            <ChangeIndicator value={rowData.change} />
          </DataTable.DefaultCell>
        ),
      },
      ...capabilityColumns,
    ];
  }, [capabilities, summary, measure, display, cellStyle]);

  return (
    <Flex flexDirection="column" gap={16} padding={24}>
      <CostToolbar title="Usage Attribution" />
      {error && (
        <MessageContainer variant="critical">
          <MessageContainer.Title>Query failed</MessageContainer.Title>
          <MessageContainer.Description>{error.message}</MessageContainer.Description>
        </MessageContainer>
      )}
      <Surface padding={16} elevation="raised">
        <Flex flexDirection="column" gap={12}>
          <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={12}>
            <Flex gap={12} flexWrap="wrap" alignItems="center">
              <ToggleButtonGroup value={measure} onChange={(value) => setMeasure(value as Measure)}>
                <ToggleButtonGroup.Item value="cost">Cost</ToggleButtonGroup.Item>
                <ToggleButtonGroup.Item value="usage">Usage</ToggleButtonGroup.Item>
              </ToggleButtonGroup>
              <ToggleButtonGroup value={display} onChange={(value) => setDisplay(value as Display)}>
                <ToggleButtonGroup.Item value="value">Value</ToggleButtonGroup.Item>
                <ToggleButtonGroup.Item value="percent">% of column</ToggleButtonGroup.Item>
              </ToggleButtonGroup>
              <ToggleButtonGroup value={cellStyle} onChange={(value) => setCellStyle(value as CellStyle)}>
                <ToggleButtonGroup.Item value="heatmap">Heatmap</ToggleButtonGroup.Item>
                <ToggleButtonGroup.Item value="bars">Bars</ToggleButtonGroup.Item>
              </ToggleButtonGroup>
            </Flex>
            <Flex gap={12} alignItems="center">
              <Text textStyle="small">
                {rows.length} cost centers · {capabilities.length} capabilities
              </Text>
              <SearchInput value={search} onChange={setSearch} placeholder="Filter cost centers" />
            </Flex>
          </Flex>
          <DataTable
            data={rows}
            columns={columns}
            loading={isLoading}
            sortable
            resizable
            fullWidth
            rowId={(row) => row.costcenter}
            interactiveRows={{ autoActivate: false }}
            activeRow={selected}
            onActiveRowChange={setSelected}
            defaultPinnedColumns={{ left: ["costcenter", "totalCost"] }}
            variant={{ rowDensity: "condensed", verticalDividers: true, verticalAlignment: "center" }}
          >
            <DataTable.Toolbar>
              <DataTable.DownloadData fileName={(subset) => `cost-attribution-${measure}-${subset}.csv`} />
            </DataTable.Toolbar>
            <DataTable.EmptyState>No billing usage found for the selected timeframe.</DataTable.EmptyState>
            <DataTable.Pagination defaultPageSize={20} pageSizeOptions={[20, 50, 100]} />
          </DataTable>
        </Flex>
      </Surface>
      <CostCenterSheet costcenter={selected} onClose={() => setSelected(null)} />
    </Flex>
  );
};
