import React from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Text } from "@dynatrace/strato-components/typography";
import { formatChange } from "../cost/format";

/** Shows the relative change vs. the previous period. Rising cost is critical, falling cost is success. */
export const ChangeIndicator = ({ value }: { value: number | null }) => {
  let color = Colors.Text.Neutral.Subdued;
  if (value !== null && value > 0.005) color = Colors.Text.Critical.Default;
  else if (value !== null && value < -0.005) color = Colors.Text.Success.Default;
  return (
    <Text textStyle="small" style={{ color, whiteSpace: "nowrap" }}>
      {formatChange(value)}
    </Text>
  );
};
