import { useEffect, useRef, useState } from "react";
import { staffApi } from "../../api/client";
import { ORDER_CHANNELS, PAYMENT_METHODS, DELIVERY_CHANNELS } from "../../data/orderConstants";
import { eligibleRewardTiers } from "../../data/rewardTiers";
import { derivePaymentStatus, parseAmount } from "../../utils/orderMath";
import { formatMoney } from "../../utils/format";
import { PaymentBadge } from "./Badges";

/**
 * Callers opt in to cash capture and kitchen notes when those fields are
 * relevant to their order workflow.
 */
export default function OrderFields({
  value,
  onChange,
  total = 0,
  errors = {},
  showAmount = true,
  showNote = true,
}) {
  const isDelivery = DELIVERY_CHANNELS.includes(value.channel);
  const paid = parseAmount(value.amountPaid);
  const paymentStatus = derivePaymentStatus(paid, total);
  const [loyaltyStatus, setLoyaltyStatus] = useState("idle");
  const lookupSeq = useRef(0);

  // Historic Foodpanda rows can still be edited, but the channel is not offered for new orders.
  const channelOptions = ORDER_CHANNELS.includes(value.channel)
    ? ORDER_CHANNELS
    : [...ORDER_CHANNELS, value.channel].filter(
        (channel, index, list) => list.indexOf(channel) === index
      );

  const setAmount = (next) =>
    onChange({ amountPaid: next === "" ? "" : String(parseAmount(next)) });

  useEffect(() => {
    const phone = String(value.customerPhone ?? "").trim();
    const digits = phone.replace(/\D/g, "");

    if (digits.length < 10 || digits.length > 15) {
      setLoyaltyStatus("idle");
      if (value.loyaltyMemberId || value.loyaltyPoints != null || value.loyaltyFound) {
        onChange({
          loyaltyMemberId: null,
          loyaltyPoints: null,
          loyaltyFound: false,
          redeemPoints: 0,
          ...(value.loyaltyFound ? { customerName: "" } : {}),
        });
      }
      return undefined;
    }

    const seq = ++lookupSeq.current;
    setLoyaltyStatus("loading");
    const timer = window.setTimeout(() => {
      staffApi
        .lookupLoyalty(digits)
        .then((data) => {
          if (lookupSeq.current !== seq) return;
          const member = data?.member;
          if (member) {
            setLoyaltyStatus("found");
            onChange({
              customerName: member.name || value.customerName || "",
              loyaltyMemberId: member.id,
              loyaltyPoints: Number(member.points) || 0,
              loyaltyFound: true,
            });
          } else {
            setLoyaltyStatus("missing");
            onChange({
              loyaltyMemberId: null,
              loyaltyPoints: null,
              loyaltyFound: false,
            });
          }
        })
        .catch(() => {
          if (lookupSeq.current !== seq) return;
          setLoyaltyStatus("idle");
        });
    }, 350);

    return () => window.clearTimeout(timer);
    // Only re-run when the phone changes — not when onChange identity shifts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.customerPhone]);

  return (
    <div className="om-fields">
      <div className="om-field">
        <span className="om-label">Order channel</span>

        <div className="om-chipset" role="group" aria-label="Order channel">
          {channelOptions.map((channel) => (
            <button
              key={channel}
              type="button"
              className={`om-choice${
                value.channel === channel ? " om-choice--on" : ""
              }`}
              aria-pressed={value.channel === channel}
              onClick={() => onChange({ channel })}
            >
              {channel}
            </button>
          ))}
        </div>
      </div>

      <div className="om-field om-field--half">
        <label className="om-label" htmlFor="om-customer-phone">
          Customer Phone Number
        </label>

        <input
          id="om-customer-phone"
          className={`om-input${errors.customerPhone ? " om-input--bad" : ""}`}
          type="tel"
          inputMode="tel"
          maxLength={40}
          autoComplete="tel"
          placeholder="03XX XXXXXXX"
          value={value.customerPhone}
          onChange={(event) =>
            onChange({
              customerPhone: event.target.value,
              loyaltyMemberId: null,
              loyaltyPoints: null,
              loyaltyFound: false,
              redeemPoints: 0,
            })
          }
        />
        <p className="om-hint">
          Optional · 10–15 digits · used for rewards (10 pts per paid order)
        </p>
        {loyaltyStatus === "loading" ? (
          <p className="om-hint om-loyalty-hint">Checking loyalty…</p>
        ) : null}
        {loyaltyStatus === "found" && value.loyaltyFound ? (
          <div className="om-loyalty-card" role="status">
            <p className="om-loyalty-name">{value.customerName || "Loyalty member"}</p>
            <p className="om-loyalty-points">
              {Number(value.loyaltyPoints) || 0} points available
            </p>
            {eligibleRewardTiers(value.loyaltyPoints).length > 0 ? (
              <div className="om-loyalty-redeem" role="group" aria-label="Redeem points">
                <span className="om-label">Redeem points</span>
                <div className="om-chipset">
                  <button
                    type="button"
                    className={`om-choice${!value.redeemPoints ? " om-choice--on" : ""}`}
                    onClick={() => onChange({ redeemPoints: 0 })}
                  >
                    None
                  </button>
                  {eligibleRewardTiers(value.loyaltyPoints).map((tier) => (
                    <button
                      key={tier.points}
                      type="button"
                      className={`om-choice${
                        Number(value.redeemPoints) === tier.points ? " om-choice--on" : ""
                      }`}
                      onClick={() =>
                        onChange({
                          redeemPoints: tier.points,
                          discountEnabled: false,
                          discountType: "percentage",
                          discountPercentage: tier.discountPercent,
                          discountValue: 0,
                        })
                      }
                    >
                      {tier.points} pts → {tier.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="om-hint om-loyalty-hint">Need at least 10 points to redeem</p>
            )}
          </div>
        ) : null}
        {loyaltyStatus === "missing" ? (
          <p className="om-hint om-loyalty-hint">No loyalty member for this number yet</p>
        ) : null}
        {errors.customerPhone ? (
          <p className="om-error">{errors.customerPhone}</p>
        ) : null}
      </div>

      {value.customerName && value.loyaltyFound ? (
        <div className="om-field om-field--half">
          <label className="om-label" htmlFor="om-customer-name">
            Customer Name
          </label>
          <input
            id="om-customer-name"
            className="om-input"
            type="text"
            maxLength={120}
            value={value.customerName}
            onChange={(event) => onChange({ customerName: event.target.value })}
          />
        </div>
      ) : null}

      {isDelivery ? (
        <div className="om-block">
          <p className="om-block-title">Rider &amp; delivery</p>

          <div className="om-form-row">
            <div className="om-field om-field--half">
              <label className="om-label" htmlFor="om-rider-name">
                Rider name
              </label>

              <input
                id="om-rider-name"
                className="om-input"
                type="text"
                maxLength={120}
                placeholder="e.g. Bilal Ahmed"
                value={value.riderName}
                onChange={(event) =>
                  onChange({ riderName: event.target.value })
                }
              />
            </div>

            <div className="om-field om-field--half">
              <label className="om-label" htmlFor="om-rider-phone">
                Rider phone
              </label>

              <input
                id="om-rider-phone"
                className="om-input"
                type="tel"
                maxLength={40}
                placeholder="e.g. 0300 1234567"
                value={value.riderPhone}
                onChange={(event) =>
                  onChange({ riderPhone: event.target.value })
                }
              />
            </div>
          </div>

          <div className="om-field">
            <label className="om-label" htmlFor="om-address">
              Delivery address <span className="om-req">required</span>
            </label>

            <textarea
              id="om-address"
              className={`om-input om-textarea${
                errors.deliveryAddress ? " om-input--bad" : ""
              }`}
              rows={2}
              placeholder="House, street, area, city"
              value={value.deliveryAddress}
              onChange={(event) =>
                onChange({ deliveryAddress: event.target.value })
              }
            />

            {errors.deliveryAddress ? (
              <p className="om-error">{errors.deliveryAddress}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="om-field">
        <span className="om-label">Payment method</span>

        <div className="om-chipset" role="group" aria-label="Payment method">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              className={`om-choice${
                value.paymentMethod === method ? " om-choice--on" : ""
              }`}
              aria-pressed={value.paymentMethod === method}
              onClick={() => onChange({ paymentMethod: method })}
            >
              {method}
            </button>
          ))}
        </div>
      </div>

      {showAmount ? (
        <div className="om-field om-field--half">
          <label className="om-label" htmlFor="om-paid">
            Amount received
          </label>

          <div className="om-inline">
            <input
              id="om-paid"
              className={`om-input om-input--money${
                errors.amountPaid ? " om-input--bad" : ""
              }`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={value.amountPaid}
              onChange={(event) => setAmount(event.target.value)}
            />

            <button
              type="button"
              className="om-mini"
              onClick={() => setAmount(String(total))}
            >
              Full
            </button>

            <button
              type="button"
              className="om-mini"
              onClick={() => setAmount(String(roundHalf(total)))}
            >
              Half
            </button>

            <button type="button" className="om-mini" onClick={() => setAmount("0")}>
              None
            </button>
          </div>

          <div className="om-paid-meta">
            <PaymentBadge status={paymentStatus} />
            <span className="om-hint">
              {paid >= total && total > 0
                ? "Fully settled"
                : `Balance ${formatMoney(Math.max(0, total - paid))}`}
            </span>
          </div>

          {errors.amountPaid ? (
            <p className="om-error">{errors.amountPaid}</p>
          ) : null}
        </div>
      ) : null}

      {showNote ? (
        <div className="om-field">
          <label className="om-label" htmlFor="om-note">
            Kitchen note
          </label>

          <textarea
            id="om-note"
            className="om-input om-textarea"
            rows={2}
            placeholder="e.g. no sugar, extra ice"
            value={value.note}
            onChange={(event) => onChange({ note: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}

function roundHalf(value) {
  return Math.round((Number(value) || 0) / 2 * 100) / 100;
}
