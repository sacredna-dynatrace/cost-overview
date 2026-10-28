import React from "react";
import { Grid, Flex, Surface } from "@dynatrace/strato-components/layouts";
import { Heading, Text, TextEllipsis } from "@dynatrace/strato-components/typography";
import { ProgressBar, SkeletonText } from "@dynatrace/strato-components/content";
import type { CostSummary } from "../cost/CostDataContext";
import { formatCost, formatPercent } from "../cost/format";
import { ChangeIndicator } from "./ChangeIndicator";
import { UNASSIGNED } from "../cost/queries";

const Kpi = ({
  label,
  children,
  footer,
}: React.PropsWithChildren<{ label: string; footer?: React.ReactNode }>) => (
  <Surface padding={16} elevation="raised">
    <Flex flexDirection="column" gap={8}>
      <Text textStyle="small-emphasized">{label}</Text>
      {children}
      {footer}
    </Flex>
  </Surface>
);

export const KpiCards = ({ summary }: { summary: CostSummary | undefined }) => {
  const top = summary?.rows.find((row) => row.costcenter !== UNASSIGNED);
  return (
    <Grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={16}>
      <Kpi
        label="Total estimated cost"
        footer={
          summary && (
            <Flex gap={4} alignItems="center">
              <ChangeIndicator value={summary.change} />
              <Text textStyle="small">vs. previous period</Text>
            </Flex>
          )
        }
      >
        {summary ? <Heading level={2}>{formatCost(summary.totalCost)}</Heading> : <SkeletonText lines={1} />}
      </Kpi>
      <Kpi
        label="Previous period"
        footer={<Text textStyle="small">Same duration, directly before</Text>}
      >
        {summary ? <Heading level={2}>{formatCost(summary.previousCost)}</Heading> : <SkeletonText lines={1} />}
      </Kpi>
      <Kpi
        label="Allocation coverage"
        footer={<Text textStyle="small">Cost assigned to a cost center</Text>}
      >
        {summary ? (
          <ProgressBar
            value={summary.coverage * 100}
            color={summary.coverage >= 0.8 ? "success" : summary.coverage >= 0.5 ? "warning" : "critical"}
            aria-label="Allocation coverage"
          >
            <ProgressBar.Value>{formatPercent(summary.coverage)}</ProgressBar.Value>
          </ProgressBar>
        ) : (
          <SkeletonText lines={1} />
        )}
      </Kpi>
      <Kpi
        label="Top cost center"
        footer={
          top && (
            <Flex gap={4} alignItems="center">
              <Text textStyle="small">{formatCost(top.totalCost)}</Text>
              <ChangeIndicator value={top.change} />
            </Flex>
          )
        }
      >
        {summary ? (
          <Heading level={4}>
            <TextEllipsis>{top?.costcenter ?? "–"}</TextEllipsis>
          </Heading>
        ) : (
          <SkeletonText lines={1} />
        )}
      </Kpi>
    </Grid>
  );
};
