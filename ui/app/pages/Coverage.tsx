import React, { useMemo } from "react";
import { Chip, MessageContainer } from "@dynatrace/strato-components/content";
import { Flex, Grid, Surface } from "@dynatrace/strato-components/layouts";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { CostToolbar } from "../components/CostToolbar";
import { ShareBar } from "../components/ShareBar";
import { useCostData } from "../cost/CostDataContext";
import { formatCost, formatUsage } from "../cost/format";
import { coverageQuery } from "../cost/queries";
import { getRate, RATE_CARD, UNCATEGORIZED } from "../cost/rateCard";
import { useAppSettings } from "../settings/AppSettingsContext";

/**
 * Cost allocation support per capability, from the rate card of the
 * "DPS Cost Allocation Overview Dashboard v3.11". "lookup" capabilities are allocated per user
 * via a lookup table instead of an entity tag.
 */
const ALLOCATION_SUPPORT: Record<string, "yes" | "lookup"> = {
  "Foundation & Discovery": "yes",
  "Full-Stack Monitoring": "yes",
  "Infrastructure Monitoring": "yes",
  "Code Monitoring": "yes",
  "Runtime Application Protection": "yes",
  "Runtime Vulnerability Analytics": "yes",
  "Log Management & Analytics - Ingest & Process": "yes",
  "Log Management & Analytics - Retain": "yes",
  "Log Management & Analytics - Retain with Included Queries": "yes",
  "Metrics - Ingest & Process": "yes",
  "Traces - Ingest & Process": "yes",
  "Automation Workflow": "lookup",
  "AppEngine Functions - Small": "lookup",
  "Events - Query": "lookup",
  "Log Management & Analytics - Query": "lookup",
  "Metrics - Query": "lookup",
  "Traces - Query": "lookup",
  "Digital Experience Monitoring - Retain": "lookup",
  "Digital Experience Monitoring - Query": "lookup",
};

type Status = "ok" | "partial" | "notConfigured" | "notSupported" | "noPrice" | "noUsage";

const STATUS: Record<Status, { label: string; color: "success" | "warning" | "critical" | "neutral" }> = {
  ok: { label: "Allocated", color: "success" },
  partial: { label: "Partially tagged", color: "warning" },
  notConfigured: { label: "Not configured", color: "critical" },
  notSupported: { label: "Not supported", color: "neutral" },
  noPrice: { label: "No price", color: "critical" },
  noUsage: { label: "No usage", color: "neutral" },
};

interface CoverageRecord {
  capability: string;
  events: number;
  tagged: number;
  withHost: number;
}

interface CoverageRow {
  capability: string;
  category: string;
  events: number;
  price: string;
  isCustomPrice: boolean;
  support: "Yes" | "Yes (lookup)" | "No";
  taggedShare: number;
  hostShare: number;
  status: Status;
}

function statusOf(row: Omit<CoverageRow, "status">, hasPrice: boolean): Status {
  if (row.events === 0) return "noUsage";
  if (!hasPrice) return "noPrice";
  if (row.support === "No") return "notSupported";
  if (row.taggedShare === 0) return "notConfigured";
  return row.taggedShare < 1 ? "partial" : "ok";
}

const columns: DataTableColumnDef<CoverageRow>[] = [
  { id: "category", header: "Category", accessor: "category", width: "1.3fr" },
  { id: "capability", header: "Capability", accessor: "capability", width: "1.8fr" },
  {
    id: "events",
    header: "Billing events",
    accessor: "events",
    alignment: "right",
    width: 120,
    cell: ({ value }) => <DataTable.DefaultCell>{formatUsage(Number(value))}</DataTable.DefaultCell>,
  },
  {
    id: "price",
    header: "Price",
    accessor: "price",
    width: "1.2fr",
    cell: ({ rowData }) => (
      <DataTable.DefaultCell>
        <Flex gap={4} alignItems="center">
          <Text>{rowData.price}</Text>
          {rowData.isCustomPrice && <Chip color="primary">Custom</Chip>}
        </Flex>
      </DataTable.DefaultCell>
    ),
  },
  { id: "support", header: "Cost allocation", accessor: "support", width: 120 },
  {
    id: "taggedShare",
    header: "Cost center tagged",
    accessor: "taggedShare",
    width: "1.2fr",
    cell: ({ value }) => (
      <DataTable.DefaultCell>
        <ShareBar share={Number(value)} />
      </DataTable.DefaultCell>
    ),
  },
  {
    id: "hostShare",
    header: "Host attributed",
    accessor: "hostShare",
    width: "1.2fr",
    cell: ({ value }) => (
      <DataTable.DefaultCell>
        <ShareBar share={Number(value)} />
      </DataTable.DefaultCell>
    ),
  },
  {
    id: "status",
    header: "Status",
    accessor: (row: CoverageRow) => STATUS[row.status].label,
    width: 140,
    cell: ({ rowData }) => (
      <DataTable.DefaultCell>
        <Chip color={STATUS[rowData.status].color}>{STATUS[rowData.status].label}</Chip>
      </DataTable.DefaultCell>
    ),
  },
];

const ORDER: Status[] = ["noPrice", "notConfigured", "partial", "ok", "notSupported", "noUsage"];

export const Coverage = () => {
  const { range } = useCostData();
  const { rates } = useAppSettings();
  const result = useDql<CoverageRecord>(coverageQuery(range.from, range.to));

  const rows = useMemo<CoverageRow[]>(() => {
    const usage = new Map((result.data?.records ?? []).map((r) => [r.capability, r]));
    const names = new Set([...RATE_CARD.map((r) => r.name), ...usage.keys()]);
    return [...names]
      .map((capability) => {
        const record = usage.get(capability);
        const events = Number(record?.events ?? 0);
        const rate = rates.get(capability);
        const listRate = getRate(capability);
        const support = ALLOCATION_SUPPORT[capability];
        const row = {
          capability,
          category: listRate?.category ?? UNCATEGORIZED,
          events,
          price: rate ? `${formatCost(rate.price)} / ${formatUsage(rate.priceUnit)} ${rate.unitName}` : "–",
          isCustomPrice:
            !!rate && !!listRate && (rate.price !== listRate.price || rate.priceUnit !== listRate.priceUnit),
          support: support === "yes" ? "Yes" : support === "lookup" ? "Yes (lookup)" : "No",
          taggedShare: events > 0 ? Number(record?.tagged ?? 0) / events : 0,
          hostShare: events > 0 ? Number(record?.withHost ?? 0) / events : 0,
        } as const;
        return { ...row, status: statusOf(row, !!rate) };
      })
      .sort(
        (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.events - a.events
      );
  }, [result.data, rates]);

  const counts = useMemo(() => {
    const used = rows.filter((r) => r.status !== "noUsage");
    return {
      used: used.length,
      allocated: used.filter((r) => r.status === "ok").length,
      attention: used.filter((r) => ["noPrice", "notConfigured", "partial"].includes(r.status)).length,
    };
  }, [rows]);

  return (
    <Flex flexDirection="column" gap={16} padding={24}>
      <CostToolbar
        title="Coverage"
        subtitle="Cost allocation and pricing status per capability · current environment"
        groupBy={null}
        showTenant={false}
      />
      {result.error && (
        <MessageContainer variant="critical">
          <MessageContainer.Title>Query failed</MessageContainer.Title>
          <MessageContainer.Description>{result.error.message}</MessageContainer.Description>
        </MessageContainer>
      )}
      <Grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={16}>
        {[
          { label: "Capabilities with usage", value: counts.used },
          { label: "Fully allocated", value: counts.allocated },
          { label: "Need attention", value: counts.attention },
        ].map(({ label, value }) => (
          <Surface key={label} padding={16} elevation="raised">
            <Flex flexDirection="column" gap={8}>
              <Text textStyle="small-emphasized">{label}</Text>
              <Heading level={2}>{result.data ? value : "–"}</Heading>
            </Flex>
          </Surface>
        ))}
      </Grid>
      <Surface padding={16} elevation="raised">
        <Flex flexDirection="column" gap={8}>
          <Text textStyle="small">
            &quot;Cost center tagged&quot; counts billing events with a dt.cost.costcenter value other than
            unassigned. &quot;Host attributed&quot; events are grouped by host name on the Overview page.
          </Text>
          <DataTable
            data={rows}
            columns={columns}
            loading={result.isLoading}
            rowId={(row) => row.capability}
            sortable
            fullWidth
            variant={{ rowDensity: "condensed", verticalAlignment: "center" }}
          />
        </Flex>
      </Surface>
    </Flex>
  );
};
