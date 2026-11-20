import { DELIVERY_CHANNELS } from "../data/orderConstants";
import { formatMoney } from "./format";

export function lineTotal(item) {
  return round2(Number(item?.price || 0) * Number(item?.quantity || 0));
}

export function computeSubtotal(items) {
  return round2(
    (items || []).reduce((sum, item) => sum + lineTotal(item), 0)
  );
}

export function derivePaymentStatus(amountPaid, total) {
  const paid = Number(amountPaid) || 0;

  if (paid <= 0) return "Unpaid";
  if (paid >= total) return "Paid";

  return "Partial";
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function parseAmount(value) {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? round2(parsed) : 0;
}

/**
 * Mirrors the tax rules the orders API applies, so the drawer can show the
 * bill the customer will actually be charged. The server still recomputes it.
 */
export function applyTax(subtotal, tax) {
  const base = round2(subtotal);

  if (!tax?.enabled || !(tax.rate > 0)) {
    return { taxAmount: 0, total: base, rate: 0, inclusive: false };
  }

  const rate = round2(tax.rate);

  if (tax.inclusive) {
    const net = round2(base / (1 + rate / 100));

    return { taxAmount: round2(base - net), total: base, rate, inclusive: true, net };
  }

  const taxAmount = round2((base * rate) / 100);

  return { taxAmount, total: round2(base + taxAmount), rate, inclusive: false };
}

/**
 * Discounts are applied before tax, so the discounted subtotal is what gets
 * taxed. Returns the discount breakdown and adjusted subtotal.
 */
export function calculateDiscount(subtotal, discount) {
  if (!discount?.enabled || !discount.type) {
    return { discountAmount: 0, discountAfterTax: false, adjustedSubtotal: subtotal };
  }

  const base = Number(subtotal) || 0;
  let discountAmount = 0;

  if (discount.type === "percentage") {
    const percent = Math.min(Number(discount.value) || 0, 100);
    discountAmount = round2((base * percent) / 100);
  } else if (discount.type === "fixed") {
    discountAmount = round2(Number(discount.value) || 0);
    discountAmount = Math.min(discountAmount, base); // Cannot exceed subtotal
  }

  discountAmount = Math.max(0, discountAmount); // Ensure non-negative

  return {
    discountAmount,
    discountAfterTax: false,
    adjustedSubtotal: round2(base - discountAmount),
  };
}

/**
 * Apply discount before GST/tax
 */
export function applyDiscountAndTax(subtotal, discount, tax) {
  const { discountAmount, discountAfterTax, adjustedSubtotal } = calculateDiscount(
    subtotal,
    discount
  );

  const taxResult = applyTax(adjustedSubtotal, tax);

  return {
    subtotal,
    discountAmount,
    discountType: discount?.type || "none",
    afterDiscountSubtotal: adjustedSubtotal,
    ...taxResult,
    total: taxResult.total, // Final total including discount & tax
  };
}

/**
 * Validate discount input
 */
export function validateDiscount(discount, subtotal) {
  const errors = {};

  if (!discount?.enabled) return errors;

  if (!discount.type || !["fixed", "percentage"].includes(discount.type)) {
    errors.type = "Invalid discount type";
    return errors;
  }

  if (discount.type === "fixed") {
    const amount = parseFloat(discount.value);
    if (isNaN(amount) || amount <= 0) {
      errors.value = "Fixed discount must be a positive number";
    } else if (amount > subtotal) {
      errors.value = `Cannot exceed subtotal of ${formatMoney(subtotal)}`;
    }
  } else if (discount.type === "percentage") {
    const percent = parseFloat(discount.value);
    if (isNaN(percent) || percent <= 0) {
      errors.value = "Percentage must be a positive number";
    } else if (percent > 100) {
      errors.value = "Percentage cannot exceed 100%";
    }
  }

  return errors;
}

/**
 * Mirrors the rules the orders API enforces, so the operator sees the problem
 * before the request round-trips.
 */
export function validateOrder({ items, channel, deliveryAddress, amountPaid, total }) {
  const errors = {};

  if (!items || items.length === 0) {
    errors.items = "Add at least one item to this order.";
  }

  if (items?.some((item) => Number(item.quantity) < 1)) {
    errors.items = "Every item needs a quantity of at least 1.";
  }

  if (DELIVERY_CHANNELS.includes(channel) && !String(deliveryAddress || "").trim()) {
    errors.deliveryAddress = "A delivery address is required for this channel.";
  }

  if (parseAmount(amountPaid) > Number(total)) {
    errors.amountPaid = "Amount paid cannot exceed the order total.";
  }

  return errors;
}
