export const ORDER_STATUSES = [
  "Pending",
  "Preparing",
  "Ready",
  "Completed",
  "Cancelled",
  "Reversed",
];

export const ORDER_CHANNELS = [
  "Dine-In",
  "Takeaway",
  "Delivery",
  "Web",
];

/** Kept only so historic orders can still be filtered/displayed. */
export const LEGACY_ORDER_CHANNELS = ["Foodpanda"];

export const PAYMENT_METHODS = ["Cash", "Card"];

export const PAYMENT_STATUSES = ["Paid", "Unpaid"];

/** Channels that require a delivery address (includes legacy Foodpanda rows). */
export const DELIVERY_CHANNELS = ["Delivery", "Foodpanda"];

/** A closed order is finished for good: no edits, no status moves, no cancel. */
export const CLOSED_STATUSES = ["Cancelled", "Reversed"];

/** The forward flow a rider/kitchen ticket walks through. */
export const STATUS_FLOW = [
  "Pending",
  "Preparing",
  "Ready",
  "Completed",
];

/** Quick picks for the reversal modal; the cashier can still type their own. */
export const REVERSAL_REASONS = [
  "Customer returned the order",
  "Wrong items rung in",
  "Payment did not go through",
  "Duplicate order",
  "Manager decision",
];

export const SHIFT_STATUSES = ["Open", "Closed"];

export const CASH_PULL_REASONS = [
  "Supplier paid in cash",
  "Petty cash float",
  "Bank deposit",
  "Charity donation",
  "Change for the till",
];

export const BRAND = {
  name: "Lexcore Solutions",
  tagline: "Intelligent Digital Solutions",
};
