import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip, MessageContainer } from "@dynatrace/strato-components/content";
import { NumberInputV2 } from "@dynatrace/strato-components/forms";
import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import { showToast } from "@dynatrace/strato-components/notifications";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { RATE_CARD, type PriceOverride } from "../cost/rateCard";
import { formatCost, formatUsage } from "../cost/format";
import { useAppSettings } from "../settings/AppSettingsContext";

interface Draft {
  price: number;
  priceUnit: number;
}

interface RateRow {
  key: string;
  name: string;
  category: string;
  unitName: string;
  listPrice: number;
  listPriceUnit: number;
}

const ROWS: RateRow[] = RATE_CARD.map((entry) => ({
  key: entry.key,
  name: entry.name,
  category: entry.category,
  unitName: entry.unitName,
  listPrice: entry.price,
  listPriceUnit: entry.priceUnit,
})).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const toDrafts = (overrides: PriceOverride[]) =>
  Object.fromEntries(
    overrides.map((o) => [o.capability, { price: o.price, priceUnit: o.priceUnit }])
  ) as Record<string, Draft>;

const isModified = (row: RateRow, draft: Draft | undefined) =>
  draft !== undefined &&
  (draft.price !== row.listPrice || draft.priceUnit !== row.listPriceUnit);

export const RateCard = () => {
  const { overrides, saveOverrides, isRateCardLoading, rateCardError } = useAppSettings();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setDrafts(toDrafts(overrides)), [overrides]);

  const savedJson = JSON.stringify(toDrafts(overrides));
  const nextOverrides = useMemo<PriceOverride[]>(
    () =>
      ROWS.filter((row) => isModified(row, drafts[row.name])).map((row) => ({
        capability: row.name,
        price: drafts[row.name].price,
        priceUnit: drafts[row.name].priceUnit,
      })),
    [drafts]
  );
  const isDirty = JSON.stringify(toDrafts(nextOverrides)) !== savedJson;

  const update = (row: RateRow, patch: Partial<Draft>) =>
    setDrafts((current) => ({
      ...current,
      [row.name]: {
        price: current[row.name]?.price ?? row.listPrice,
        priceUnit: current[row.name]?.priceUnit ?? row.listPriceUnit,
        ...patch,
      },
    }));

  const columns = useMemo<DataTableColumnDef<RateRow>[]>(
    () => [
      { id: "category", header: "Category", accessor: "category", width: "1.4fr" },
      { id: "name", header: "Capability", accessor: "name", width: "1.8fr" },
      { id: "unitName", header: "Unit", accessor: "unitName", width: "1fr" },
      {
        id: "list",
        header: "List price",
        accessor: "listPrice",
        alignment: "right",
        width: "1.2fr",
        cell: ({ rowData }) => (
          <DataTable.DefaultCell>
            {formatCost(rowData.listPrice)} / {formatUsage(rowData.listPriceUnit)}
          </DataTable.DefaultCell>
        ),
      },
      {
        id: "price",
        header: "Price (USD)",
        accessor: (row: RateRow) => drafts[row.name]?.price ?? row.listPrice,
        width: 150,
        cell: ({ rowData, value }) => (
          <DataTable.DefaultCell>
            <NumberInputV2
              aria-label={`Price for ${rowData.name}`}
              value={Number(value)}
              min={0}
              onChange={(price) => update(rowData, { price: price ?? 0 })}
            />
          </DataTable.DefaultCell>
        ),
      },
      {
        id: "priceUnit",
        header: "Per units",
        accessor: (row: RateRow) => drafts[row.name]?.priceUnit ?? row.listPriceUnit,
        width: 150,
        cell: ({ rowData, value }) => (
          <DataTable.DefaultCell>
            <NumberInputV2
              aria-label={`Units for ${rowData.name}`}
              value={Number(value)}
              min={1}
              onChange={(priceUnit) => update(rowData, { priceUnit: priceUnit ?? 1 })}
            />
          </DataTable.DefaultCell>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: (row: RateRow) => (isModified(row, drafts[row.name]) ? "custom" : "list"),
        width: 100,
        cell: ({ value }) => (
          <DataTable.DefaultCell>
            {value === "custom" ? <Chip color="primary">Custom</Chip> : <Text textStyle="small">List</Text>}
          </DataTable.DefaultCell>
        ),
      },
    ],
    [drafts]
  );

  const save = async () => {
    setIsSaving(true);
    try {
      await saveOverrides(nextOverrides);
      showToast({ title: "Rate card saved", type: "success" });
    } catch (error) {
      showToast({
        title: "Failed to save rate card",
        type: "critical",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Flex flexDirection="column" gap={16} padding={24}>
      <Flex justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={12}>
        <Flex flexDirection="column" gap={4}>
          <Heading level={1}>Rate Card</Heading>
          <Text textStyle="small">
            Prices apply to the estimated costs of all users. Capabilities without a custom price use the DPS list price.
          </Text>
        </Flex>
        <Flex gap={8}>
          <Button onClick={() => setDrafts({})} disabled={isSaving}>
            Reset all to list price
          </Button>
          <Button onClick={() => setDrafts(toDrafts(overrides))} disabled={!isDirty || isSaving}>
            Discard
          </Button>
          <Button variant="emphasized" color="primary" onClick={() => void save()} disabled={!isDirty} loading={isSaving}>
            Save
          </Button>
        </Flex>
      </Flex>
      {rateCardError && (
        <MessageContainer variant="warning">
          <MessageContainer.Title>Rate card could not be loaded</MessageContainer.Title>
          <MessageContainer.Description>
            List prices are used until it is available. {rateCardError}
          </MessageContainer.Description>
        </MessageContainer>
      )}
      <Surface padding={16} elevation="raised">
        <DataTable
          data={ROWS}
          columns={columns}
          loading={isRateCardLoading}
          rowId={(row) => row.name}
          fullWidth
          sortable
          variant={{ rowDensity: "condensed", verticalAlignment: "center" }}
        />
      </Surface>
    </Flex>
  );
};
