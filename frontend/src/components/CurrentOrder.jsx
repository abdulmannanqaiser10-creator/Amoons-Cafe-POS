import { useEffect, useRef, useState } from "react";
import OrderFields from "./orders/OrderFields";
import { applyDiscountAndTax, validateDiscount } from "../utils/orderMath";
import { formatMoney } from "../utils/format";
import { findRewardTier } from "../data/rewardTiers";

const QUICK_FIXED = [50, 100, 200];

function CurrentOrder({
  cart,
  cartCount = 0,
  subtotal = 0,
  tax = null,
  updateQuantity,
  removeItem,
  form,
  onFormChange,
  errors = {},
  saving = false,
  onSubmit,
  onClear,
  onNotice,
  editingLabel = "",
}) {
  const redeemPoints = Math.trunc(Number(form?.redeemPoints) || 0);
  const redeemTier = redeemPoints > 0 ? findRewardTier(redeemPoints) : null;

  const discountEnabled = !!form?.discountEnabled || Boolean(redeemTier);
  const discountType = redeemTier
    ? "percentage"
    : form?.discountType || "fixed";
  const discountValue = redeemTier
    ? redeemTier.discountPercent
    : discountType === "percentage"
      ? Number(form?.discountPercentage || 0)
      : Number(form?.discountValue || 0);

  const patchDiscount = (patch) => {
    if (!onFormChange) return;
    onFormChange({
      ...patch,
      ...(patch.discountEnabled === false || patch.discountType || patch.discountValue != null
        ? { redeemPoints: 0 }
        : {}),
    });
  };

  const bill = applyDiscountAndTax(
    subtotal,
    discountEnabled
      ? { enabled: true, type: discountType, value: discountValue }
      : null,
    tax
  );
  const { total, discountAmount, afterDiscountSubtotal, taxAmount, rate } = bill;
  const discountErrors =
    discountEnabled && !redeemTier
      ? validateDiscount(
          { enabled: true, type: discountType, value: discountValue },
          subtotal
        )
      : {};

  const submitting = useRef(false);
  const [printMode, setPrintMode] = useState("");

  useEffect(() => {
    if (!saving) {
      submitting.current = false;
      setPrintMode("");
    }
  }, [saving]);

  const runCheckout = async (mode) => {
    if (saving || submitting.current || cart.length === 0) return;
    if (Object.keys(discountErrors).length > 0) {
      onNotice?.(discountErrors.value || "Fix the discount before printing.");
      return;
    }
    if (redeemTier && Number(form?.loyaltyPoints || 0) < redeemTier.points) {
      onNotice?.(
        `Not enough points. Need ${redeemTier.points}, have ${Number(form?.loyaltyPoints || 0)}.`
      );
      return;
    }
    submitting.current = true;
    setPrintMode(mode);
    try {
      await Promise.resolve(onSubmit?.(mode));
    } finally {
      submitting.current = false;
    }
  };

  const kotBusy = saving && (printMode === "kitchen" || printMode === "kot");
  const billBusy = saving && printMode === "bill";

  return (
    <div className="ord ord--compact ord--page">
      <div className="ord-head">
        <div>
          <h2 className="ord-title">
            {editingLabel ? `Edit ${editingLabel}` : "Order summary"}
          </h2>
          <p className="ord-sub">
            {cart.length} items · {cartCount} pcs
          </p>
        </div>
      </div>

      <div className="ord-scroll">
        <section className="ord-items" aria-label="Cart items">
          {cart.length === 0 ? (
            <p className="ord-empty">No items yet — tap a product to add it.</p>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="ord-item">
                <div className="ord-item-info">
                  <h3 className="ord-item-name">{item.name}</h3>
                  <p className="ord-item-price">
                    {formatMoney(item.price * item.quantity)}
                    <span className="ord-item-unit">
                      {" "}
                      · {item.quantity} × {formatMoney(item.price)}
                    </span>
                  </p>
                </div>

                <div className="ord-item-actions">
                  <button
                    type="button"
                    className="ord-qty-btn"
                    onClick={() => updateQuantity(item.id, -1)}
                    aria-label={`Decrease ${item.name}`}
                  >
                    −
                  </button>

                  <span className="ord-qty">{item.quantity}</span>

                  <button
                    type="button"
                    className="ord-qty-btn"
                    onClick={() => updateQuantity(item.id, 1)}
                    aria-label={`Increase ${item.name}`}
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="ord-remove"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}

          {errors.items ? <p className="om-error">{errors.items}</p> : null}
        </section>

        <section className="ord-checkout">
          <h3 className="ord-section-title">Order details</h3>

          <OrderFields
            value={form}
            onChange={onFormChange}
            total={total}
            errors={errors}
            showAmount={false}
            showNote={false}
          />
        </section>

        <section className="ord-discount" aria-label="Discount">
          <div className="ord-discount-toggle-row">
            <div>
              <h3 className="ord-section-title">Apply Discount</h3>
              <p className="ord-discount-hint">Before GST · loyalty redeem overrides manual %</p>
            </div>
            <button
              type="button"
              className={`ord-toggle${form?.discountEnabled && !redeemTier ? " ord-toggle--on" : ""}`}
              aria-pressed={!!form?.discountEnabled && !redeemTier}
              disabled={Boolean(redeemTier)}
              onClick={() =>
                patchDiscount({
                  discountEnabled: !form?.discountEnabled,
                  discountType: discountType || "fixed",
                  discountValue: Number(form?.discountValue || 0),
                  discountPercentage: Number(form?.discountPercentage || 0),
                  redeemPoints: 0,
                })
              }
            >
              <span className="ord-toggle-knob" />
              <span className="ord-toggle-label">
                {form?.discountEnabled && !redeemTier ? "On" : "Off"}
              </span>
            </button>
          </div>

          {form?.discountEnabled && !redeemTier ? (
            <>
              <div className="ord-discount-quick" role="group" aria-label="Quick discounts">
                {QUICK_FIXED.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={`ord-discount-chip${
                      discountType === "fixed" && Number(form?.discountValue) === amount
                        ? " ord-discount-chip--on"
                        : ""
                    }`}
                    onClick={() =>
                      patchDiscount({
                        discountEnabled: true,
                        discountType: "fixed",
                        discountValue: amount,
                        discountPercentage: 0,
                        redeemPoints: 0,
                      })
                    }
                  >
                    Rs. {amount}
                  </button>
                ))}
              </div>

              <div className="ord-discount-types" role="group" aria-label="Discount type">
                <button
                  type="button"
                  className={`ord-discount-chip${
                    discountType === "fixed" ? " ord-discount-chip--on" : ""
                  }`}
                  onClick={() =>
                    patchDiscount({
                      discountType: "fixed",
                      discountPercentage: 0,
                      redeemPoints: 0,
                    })
                  }
                >
                  Fixed (Rs.)
                </button>
                <button
                  type="button"
                  className={`ord-discount-chip${
                    discountType === "percentage" ? " ord-discount-chip--on" : ""
                  }`}
                  onClick={() =>
                    patchDiscount({
                      discountType: "percentage",
                      discountValue: 0,
                      redeemPoints: 0,
                    })
                  }
                >
                  Percentage (%)
                </button>
              </div>

              <label className="ord-discount-input-wrap">
                <span className="om-label">
                  {discountType === "percentage" ? "Custom %" : "Custom amount"}
                </span>
                <input
                  className={`om-input${discountErrors.value ? " om-input--bad" : ""}`}
                  type="number"
                  min="0"
                  step={discountType === "percentage" ? "0.1" : "1"}
                  value={
                    discountType === "percentage"
                      ? form?.discountPercentage || ""
                      : form?.discountValue || ""
                  }
                  placeholder={discountType === "percentage" ? "e.g. 10" : "e.g. 75"}
                  onChange={(event) => {
                    const next = Number(event.target.value) || 0;
                    if (discountType === "percentage") {
                      patchDiscount({
                        discountType: "percentage",
                        discountPercentage: next,
                        discountValue: 0,
                        redeemPoints: 0,
                      });
                    } else {
                      patchDiscount({
                        discountType: "fixed",
                        discountValue: next,
                        discountPercentage: 0,
                        redeemPoints: 0,
                      });
                    }
                  }}
                />
              </label>
              {discountErrors.value ? (
                <p className="om-error">{discountErrors.value}</p>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      <div className="ord-foot">
        <div className="ord-tally">
          <div className="ord-tally-row">
            <span className="ord-tally-label">Subtotal</span>
            <span className="ord-tally-value">{formatMoney(subtotal)}</span>
          </div>

          {discountAmount > 0 ? (
            <div className="ord-tally-row">
              <span className="ord-tally-label">
                {redeemTier
                  ? `Loyalty (${redeemTier.points} pts → ${redeemTier.label})`
                  : discountType === "percentage"
                    ? `Discount (${discountValue}%)`
                    : `Discount (Rs. ${formatMoney(discountValue)})`}
              </span>
              <span className="ord-tally-value ord-tally-value--discount">
                −{formatMoney(discountAmount)}
              </span>
            </div>
          ) : null}

          {redeemTier ? (
            <div className="ord-tally-row">
              <span className="ord-tally-label">Redeemed points</span>
              <span className="ord-tally-value">{redeemTier.points} pts</span>
            </div>
          ) : null}

          {discountAmount > 0 ? (
            <div className="ord-tally-row">
              <span className="ord-tally-label">After discount</span>
              <span className="ord-tally-value">
                {formatMoney(afterDiscountSubtotal)}
              </span>
            </div>
          ) : null}

          {taxAmount > 0 ? (
            <div className="ord-tally-row">
              <span className="ord-tally-label">
                {tax?.label || "GST"} ({rate}%)
              </span>
              <span className="ord-tally-value">{formatMoney(taxAmount)}</span>
            </div>
          ) : null}

          <div className="ord-tally-row ord-tally-row--total">
            <span className="ord-tally-label">Grand Total</span>
            <span className="ord-tally-value">{formatMoney(total)}</span>
          </div>
        </div>

        <div className="ord-actions">
          <button
            type="button"
            className="ord-ghost"
            onClick={onClear}
            disabled={saving || cart.length === 0}
          >
            Clear
          </button>

          <button
            type="button"
            className="ord-print ord-print--kot"
            onClick={() => runCheckout("kitchen")}
            disabled={saving || cart.length === 0}
            title="Print kitchen ticket only — keeps this order open"
          >
            {kotBusy ? "Printing KOT…" : "Print KOT"}
          </button>

          <button
            type="button"
            className="ord-print ord-print--bill"
            onClick={() => runCheckout("bill")}
            disabled={saving || cart.length === 0}
            title="Save order and print customer bill"
          >
            {billBusy ? "Printing Bill…" : saving ? "Working…" : "Print Bill"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CurrentOrder;
