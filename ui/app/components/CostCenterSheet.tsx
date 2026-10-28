import React, { useMemo } from "react";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Sheet } from "@dynatrace/strato-components/overlays";
import { useDql } from "@dynatrace-sdk/react-hooks";
import {
  toCostSeries,
  toDailyCostSeries,
  toTrendRecords,
  useCostData,
  type TrendRecord,
} from "../cost/CostDataContext";
import { costCenterTrendQuery, UNASSIGNED } from "../cost/queries";
import { useAppSettings } from "../settings/AppSettingsContext";
import { CapabilityBreakdown, CostCenterStats, CostTrend, toBreakdown, toShiftedTotal } from "./CostCenterDetail";

/** Side sheet with the trend and capability breakdown of one cost center. */
export const CostCenterSheet = ({
  costcenter,
  onClose,
}: {
  costcenter: string | null;
  onClose: () => void;
}) => {
  const { summary, range, normalized, source, accountRecords } = useCostData();
  const isBilled = source === "account";
  const { rates } = useAppSettings();
  const row = summary?.rows.find((r) => r.costcenter === costcenter);
  const costLabel = isBilled ? "Billed cost" : "Estimated cost";

  const trend = useDql<TrendRecord>(
    costCenterTrendQuery(costcenter ?? "", range.from, range.to, range.interval),
    { enabled: costcenter !== null && !isBilled }
  );

  const previousTrend = useDql<TrendRecord>(
    costCenterTrendQuery(costcenter ?? "", range.prevFrom, range.from, range.interval),
    { enabled: costcenter !== null && !isBilled }
  );

  // Billed data of another environment: daily series straight from the account records.
  const billed = useMemo(() => {
    if (!isBilled || costcenter === null) return undefined;
    const ofCenter = (records: typeof accountRecords.current) =>
      records.filter((r) => r.costcenter === costcenter);
    return {
      series: toDailyCostSeries(ofCenter(accountRecords.current), "capability"),
      previousTotal: toShiftedTotal(
        toDailyCostSeries(ofCenter(accountRecords.previous), "capability"),
        Date.parse(range.from) - Date.parse(range.prevFrom)
      ),
    };
  }, [isBilled, costcenter, accountRecords, range]);

  const series = useMemo(
    () =>
      trend.data && costcenter !== null
        ? toCostSeries(
            [
              ...trend.data.records,
              ...toTrendRecords(normalized ?? [], "current", range.from, range.to, range.step, costcenter),
            ],
            "capability",
            rates
          )
        : [],
    [trend.data, normalized, range, costcenter, rates]
  );

  const previousTotal = useMemo(
    () =>
      previousTrend.data && costcenter !== null
        ? toShiftedTotal(
            toCostSeries(
              [
                ...previousTrend.data.records,
                ...toTrendRecords(normalized ?? [], "previous", range.prevFrom, range.from, range.step, costcenter),
              ],
              "capability",
              rates
            ),
            Date.parse(range.from) - Date.parse(range.prevFrom)
          )
        : undefined,
    [previousTrend.data, normalized, range, costcenter, rates]
  );

  const breakdown = useMemo(() => (row ? toBreakdown(row.cost, row.usage) : []), [row]);

  return (
    <Sheet
      title={costcenter ?? ""}
      show={costcenter !== null}
      onDismiss={onClose}
      actions={<Button onClick={onClose}>Close</Button>}
    >
      <Flex flexDirection="column" gap={16}>
        {costcenter === UNASSIGNED && (
          <MessageContainer variant="neutral">
            <MessageContainer.Description>
              {isBilled
                ? "Billed cost without a cost center tag."
                : "Usage without a host or cost center tag, e.g. RUM, Synthetic, Automation and Grail retention."}
            </MessageContainer.Description>
          </MessageContainer>
        )}
        <CostCenterStats
          costLabel={costLabel}
          cost={row?.totalCost}
          previousCost={row?.previousCost}
          change={row?.change}
          share={row?.share}
          shareLabel="Share of total cost"
        />
        <CostTrend
          title={isBilled ? "Daily billed cost by capability" : "Estimated cost trend by capability"}
          series={billed ? billed.series : series}
          previous={billed ? billed.previousTotal : previousTotal}
          loading={billed ? false : trend.isLoading}
          error={billed ? undefined : trend.error?.message}
        />
        <CapabilityBreakdown rows={breakdown} costLabel={costLabel} />
      </Flex>
    </Sheet>
  );
};
