import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { formatPercent } from "../cost/format";

/** Horizontal bar with percentage label, for a share between 0 and 1. */
export const ShareBar = ({ share }: { share: number }) => (
  <Flex alignItems="center" gap={8} style={{ width: "100%" }}>
    <div
      style={{
        flex: 1,
        height: 8,
        borderRadius: 4,
        background: Colors.Background.Container.Neutral.Default,
      }}
    >
      <div
        style={{
          width: `${Math.max(share * 100, 0.5)}%`,
          height: "100%",
          borderRadius: 4,
          background: Colors.Charts.Categorical.Color01.Default,
        }}
      />
    </div>
    <Text textStyle="small" style={{ width: 48, textAlign: "right" }}>
      {formatPercent(share)}
    </Text>
  </Flex>
);
