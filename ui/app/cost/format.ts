import { CURRENCY } from "./rateCard";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 2,
});

const compactCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const compactNumber = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatCost = (value: number) => currency.format(value);

export const formatCostCompact = (value: number) =>
  Math.abs(value) >= 10000 ? compactCurrency.format(value) : currency.format(value);

export const formatUsage = (value: number) =>
  Math.abs(value) >= 100000 ? compactNumber.format(value) : number.format(value);

export const formatPercent = (value: number) =>
  `${(value * 100).toFixed(value > 0 && value < 0.001 ? 2 : 1)}%`;

export const formatChange = (value: number | null) =>
  value === null ? "new" : `${value >= 0 ? "▲" : "▼"} ${formatPercent(Math.abs(value))}`;
