import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  digitalMenuApi,
  money,
  parseTableFromPath,
  getCustomerToken,
} from "../../api/digitalMenu";
import { eligibleRewardTiers, REWARD_TIERS } from "../../data/rewardTiers";
import "./DigitalMenu.css";

function errorText(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    fallback ||
    "Something went wrong."
  );
}

function ProductArt({ name, category }) {
  const letter = String(name || category || "A").slice(0, 1).toUpperCase();
  return (
    <div className="dm-art" aria-hidden="true">
      <span>{letter}</span>
    </div>
  );
}

export default function DigitalMenu() {
  const location = useLocation();
  const tableNumber = parseTableFromPath(location.pathname);

  const [phase, setPhase] = useState("landing"); // landing | menu | cart | checkout | done
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [catalogue, setCatalogue] = useState(null);
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);

  const [checkout, setCheckout] = useState({
    name: "",
    phone: "",
    paymentMethod: "Cash",
    redeemPoints: 0,
  });
  const [showRewardsPopup, setShowRewardsPopup] = useState(false);
  const [rewardsForm, setRewardsForm] = useState({ name: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await digitalMenuApi.catalogue(tableNumber);
        if (!active) return;
        setCatalogue(data);
        if (getCustomerToken()) {
          try {
            const me = await digitalMenuApi.me();
            if (active && me?.customer) {
              setCustomer(me.customer);
              setCheckout((c) => ({
                ...c,
                name: me.customer.name || c.name,
                phone: me.customer.phone || c.phone,
              }));
            }
          } catch {
            /* guest ok */
          }
        }
      } catch (problem) {
        if (active) setError(errorText(problem, "Could not load the digital menu."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [tableNumber]);

  const products = catalogue?.products || [];
  const categories = useMemo(
    () => ["All", ...(catalogue?.categories || []).map((c) => c.name)],
    [catalogue]
  );

  const visible = useMemo(() => {
    const sellable = products.filter((p) => p.canSell !== false);
    if (category === "All") return sellable;
    return sellable.filter((p) => p.category === category);
  }, [products, category]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartSubtotal = cart.reduce(
    (sum, line) => sum + line.quantity * line.price,
    0
  );

  const suggestions = useMemo(() => {
    if (!cart.length) return [];
    const inCart = new Set(cart.map((l) => l.id));
    const last = cart[cart.length - 1];
    const same = products.filter(
      (p) => p.canSell !== false && p.category === last.category && !inCart.has(p.id)
    );
    const others = products.filter(
      (p) => p.canSell !== false && !inCart.has(p.id) && p.category !== last.category
    );
    return [...same, ...others].slice(0, 4);
  }, [cart, products]);

  const redeemTier =
    checkout.redeemPoints > 0
      ? REWARD_TIERS.find((t) => t.points === checkout.redeemPoints)
      : null;
  const discountAmount = redeemTier
    ? Math.round(((cartSubtotal * redeemTier.discountPercent) / 100) * 100) / 100
    : 0;
  const afterDiscount = Math.max(0, cartSubtotal - discountAmount);
  const taxRate = checkout.paymentMethod === "Card" ? 8 : 15;
  const taxAmount = Math.round(afterDiscount * (taxRate / 100) * 100) / 100;
  const total = Math.round((afterDiscount + taxAmount) * 100) / 100;

  const addToCart = (product) => {
    setCart((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.id === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          price: Number(product.price),
          category: product.category,
          imageUrl: product.imageUrl,
          quantity: 1,
        },
      ];
    });
    setNotice(`${product.name} added`);
    window.setTimeout(() => setNotice(""), 1600);
  };

  const updateQty = (id, delta) => {
    setCart((current) =>
      current
        .map((line) =>
          line.id === id
            ? { ...line, quantity: Math.max(0, line.quantity + delta) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  };

  const beginCheckout = () => {
    if (!cart.length) return;
    setPhase("checkout");
    setShowRewardsPopup(true);
    setRewardsForm({
      name: checkout.name || customer?.name || "",
      phone: checkout.phone || customer?.phone || "",
    });
  };

  const registerRewards = async () => {
    setSubmitting(true);
    setError("");
    try {
      const name = rewardsForm.name.trim() || checkout.name.trim();
      const phone = rewardsForm.phone.trim();
      if (!name) throw new Error("Enter your name to register for rewards.");
      if (!phone) throw new Error("Enter your phone number to earn rewards.");
      const result = await digitalMenuApi.register({ name, phone });
      setCustomer(result.customer);
      setCheckout((c) => ({
        ...c,
        name: result.customer.name || name,
        phone: result.customer.phone || phone,
      }));
      setShowRewardsPopup(false);
      setNotice(`Welcome${result.customer?.points ? ` · ${result.customer.points} pts` : ""}`);
    } catch (problem) {
      setError(errorText(problem, "Could not register rewards."));
    } finally {
      setSubmitting(false);
    }
  };

  const skipRewards = () => {
    setShowRewardsPopup(false);
    setCheckout((c) => ({
      ...c,
      redeemPoints: 0,
      name: c.name || rewardsForm.name,
      phone: c.phone || rewardsForm.phone,
    }));
  };

  const placeOrder = async () => {
    setSubmitting(true);
    setError("");
    try {
      const name = checkout.name.trim();
      if (!name) throw new Error("Customer name is required.");
      if (checkout.redeemPoints > 0 && !checkout.phone.trim()) {
        throw new Error("Phone number is required to redeem rewards.");
      }
      if (checkout.redeemPoints > 0 && !getCustomerToken()) {
        setShowRewardsPopup(true);
        throw new Error("Register your number before redeeming rewards.");
      }

      const clientOrderKey = `dm-${tableNumber}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const result = await digitalMenuApi.placeOrder({
        tableNumber,
        customerName: name,
        customerPhone: checkout.phone.trim() || undefined,
        paymentMethod: checkout.paymentMethod,
        redeemPoints: checkout.redeemPoints || 0,
        amountPaid: total,
        clientOrderKey,
        items: cart.map((line) => ({
          productId: line.id,
          name: line.name,
          quantity: line.quantity,
        })),
      });

      setConfirmation(result.order);
      setCart([]);
      setPhase("done");
      if (getCustomerToken()) {
        try {
          const me = await digitalMenuApi.me();
          if (me?.customer) setCustomer(me.customer);
        } catch {
          /* ignore */
        }
      }
    } catch (problem) {
      setError(errorText(problem, "Could not place the order."));
    } finally {
      setSubmitting(false);
    }
  };

  const brandName = catalogue?.business?.name || "Amoons";
  const eligible = eligibleRewardTiers(customer?.points || 0);

  if (loading) {
    return (
      <div className="dm-page dm-page--center">
        <div className="dm-loader">Loading {brandName} menu…</div>
      </div>
    );
  }

  if (error && !catalogue) {
    return (
      <div className="dm-page dm-page--center">
        <div className="dm-error-card">
          <h1>Menu unavailable</h1>
          <p>{error}</p>
          <button type="button" className="dm-btn dm-btn--primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`dm-page dm-page--${phase}`}>
      {notice ? <div className="dm-toast" role="status">{notice}</div> : null}

      {phase === "landing" ? (
        <section className="dm-hero">
          <div className="dm-hero-overlay" />
          <div className="dm-hero-copy">
            <p className="dm-kicker">Table {tableNumber}</p>
            <h1>{brandName}</h1>
            <p className="dm-hero-sub">
              {catalogue?.business?.tagline ||
                "Scan. Order. Enjoy — and earn rewards with every visit."}
            </p>
            <button
              type="button"
              className="dm-btn dm-btn--primary dm-btn--xl"
              onClick={() => setPhase("menu")}
            >
              Explore Menu
            </button>
          </div>
          <div className="dm-hero-grid" aria-hidden="true">
            {products.slice(0, 6).map((item) =>
              item.imageUrl ? (
                <img key={item.id} src={item.imageUrl} alt="" />
              ) : (
                <ProductArt key={item.id} name={item.name} category={item.category} />
              )
            )}
          </div>
        </section>
      ) : null}

      {phase === "menu" || phase === "cart" ? (
        <>
          <header className="dm-top">
            <div>
              <p className="dm-kicker">Table {tableNumber}</p>
              <strong>{brandName}</strong>
            </div>
            <button
              type="button"
              className="dm-cart-pill"
              onClick={() => setPhase(cartCount ? "cart" : "menu")}
            >
              Cart · {cartCount}
            </button>
          </header>

          <nav className="dm-cats" aria-label="Categories">
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                className={`dm-cat${category === name ? " dm-cat--on" : ""}`}
                onClick={() => {
                  setCategory(name);
                  setPhase("menu");
                }}
              >
                {name}
              </button>
            ))}
          </nav>

          {phase === "menu" ? (
            <main className="dm-main">
              <div className="dm-grid">
                {visible.map((item) => (
                  <article key={item.id} className="dm-card">
                    <div className="dm-card-media">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} />
                      ) : (
                        <ProductArt name={item.name} category={item.category} />
                      )}
                    </div>
                    <div className="dm-card-body">
                      <h3>{item.name}</h3>
                      <p>{item.description || item.category}</p>
                      <div className="dm-card-row">
                        <strong>{money(item.price)}</strong>
                        <button
                          type="button"
                          className="dm-btn dm-btn--soft"
                          onClick={() => addToCart(item)}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {suggestions.length ? (
                <section className="dm-suggest">
                  <h2>You may also like</h2>
                  <div className="dm-suggest-row">
                    {suggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="dm-suggest-card"
                        onClick={() => addToCart(item)}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" />
                        ) : (
                          <ProductArt name={item.name} />
                        )}
                        <span>{item.name}</span>
                        <small>{money(item.price)}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </main>
          ) : null}

          {phase === "cart" ? (
            <main className="dm-main dm-cart">
              <h2>Your cart</h2>
              {!cart.length ? (
                <p className="dm-empty">Your cart is empty.</p>
              ) : (
                <ul className="dm-cart-list">
                  {cart.map((line) => (
                    <li key={line.id}>
                      <div>
                        <strong>{line.name}</strong>
                        <small>{money(line.price)}</small>
                      </div>
                      <div className="dm-qty">
                        <button type="button" onClick={() => updateQty(line.id, -1)}>
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button type="button" onClick={() => updateQty(line.id, 1)}>
                          +
                        </button>
                      </div>
                      <strong>{money(line.price * line.quantity)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <div className="dm-cart-foot">
                <p>
                  Subtotal <strong>{money(cartSubtotal)}</strong>
                </p>
                <button
                  type="button"
                  className="dm-btn dm-btn--primary"
                  disabled={!cart.length}
                  onClick={beginCheckout}
                >
                  Checkout
                </button>
                <button
                  type="button"
                  className="dm-btn dm-btn--ghost"
                  onClick={() => setPhase("menu")}
                >
                  Keep browsing
                </button>
              </div>
            </main>
          ) : null}

          {cartCount > 0 && phase === "menu" ? (
            <button
              type="button"
              className="dm-fab"
              onClick={() => setPhase("cart")}
            >
              View cart · {cartCount} · {money(cartSubtotal)}
            </button>
          ) : null}
        </>
      ) : null}

      {phase === "checkout" ? (
        <main className="dm-main dm-checkout">
          <header className="dm-checkout-head">
            <button type="button" className="dm-link" onClick={() => setPhase("cart")}>
              ← Cart
            </button>
            <h2>Checkout · Table {tableNumber}</h2>
          </header>

          {error ? <p className="dm-banner dm-banner--error">{error}</p> : null}

          <label className="dm-field">
            Customer name *
            <input
              value={checkout.name}
              onChange={(event) =>
                setCheckout((c) => ({ ...c, name: event.target.value }))
              }
              placeholder="Your name"
              required
            />
          </label>

          <label className="dm-field">
            Phone number (optional)
            <input
              value={checkout.phone}
              onChange={(event) =>
                setCheckout((c) => ({ ...c, phone: event.target.value, redeemPoints: 0 }))
              }
              placeholder="03XX XXXXXXX"
              inputMode="tel"
            />
            <small>
              Add your number to earn {catalogue?.pointsPerOrder || 10} loyalty
              points on every completed order and redeem rewards.
            </small>
          </label>

          {customer ? (
            <div className="dm-points">
              <strong>{customer.points} points</strong>
              <span>available on {customer.phone}</span>
            </div>
          ) : null}

          <fieldset className="dm-pay">
            <legend>Payment</legend>
            {["Cash", "Card"].map((method) => (
              <label key={method} className="dm-pay-option">
                <input
                  type="radio"
                  name="pay"
                  checked={checkout.paymentMethod === method}
                  onChange={() =>
                    setCheckout((c) => ({ ...c, paymentMethod: method }))
                  }
                />
                <span>{method}</span>
              </label>
            ))}
          </fieldset>

          {(customer || checkout.phone) && (
            <fieldset className="dm-rewards">
              <legend>Redeem rewards</legend>
              <label className="dm-pay-option">
                <input
                  type="radio"
                  name="redeem"
                  checked={checkout.redeemPoints === 0}
                  onChange={() => setCheckout((c) => ({ ...c, redeemPoints: 0 }))}
                />
                <span>No reward</span>
              </label>
              {REWARD_TIERS.map((tier) => {
                const can =
                  (customer?.points || 0) >= tier.points && Boolean(getCustomerToken());
                return (
                  <label
                    key={tier.points}
                    className={`dm-pay-option${!can ? " dm-pay-option--disabled" : ""}`}
                  >
                    <input
                      type="radio"
                      name="redeem"
                      disabled={!can}
                      checked={checkout.redeemPoints === tier.points}
                      onChange={() =>
                        setCheckout((c) => ({ ...c, redeemPoints: tier.points }))
                      }
                    />
                    <span>
                      {tier.points} pts · {tier.label}
                      {!can ? " (need points / register)" : ""}
                    </span>
                  </label>
                );
              })}
              {eligible.length ? (
                <p className="dm-hint">
                  You can redeem: {eligible.map((t) => t.label).join(", ")}
                </p>
              ) : null}
            </fieldset>
          )}

          <div className="dm-summary">
            <p>
              <span>Subtotal</span>
              <strong>{money(cartSubtotal)}</strong>
            </p>
            {discountAmount > 0 ? (
              <p>
                <span>Reward discount</span>
                <strong>−{money(discountAmount)}</strong>
              </p>
            ) : null}
            <p>
              <span>Tax ({taxRate}%)</span>
              <strong>{money(taxAmount)}</strong>
            </p>
            <p className="dm-summary-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </p>
          </div>

          <button
            type="button"
            className="dm-btn dm-btn--primary dm-btn--xl"
            disabled={submitting || !cart.length}
            onClick={placeOrder}
          >
            {submitting ? "Placing order…" : "Place order"}
          </button>
          <button
            type="button"
            className="dm-btn dm-btn--ghost"
            onClick={() => setShowRewardsPopup(true)}
          >
            Register number & earn rewards
          </button>
        </main>
      ) : null}

      {phase === "done" && confirmation ? (
        <main className="dm-main dm-done">
          <div className="dm-done-card">
            <p className="dm-kicker">Order confirmed</p>
            <h1>{confirmation.orderNumber}</h1>
            <p>Table {confirmation.tableNumber} · {confirmation.paymentMethod}</p>
            <ul>
              {(confirmation.items || []).map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <strong>{money(item.lineTotal)}</strong>
                </li>
              ))}
            </ul>
            <p className="dm-done-total">
              Total <strong>{money(confirmation.total)}</strong>
            </p>
            {confirmation.redeemedPoints > 0 ? (
              <p className="dm-done-pts">
                Redeemed {confirmation.redeemedPoints} points
              </p>
            ) : null}
            {confirmation.loyaltyPointsPending > 0 ? (
              <p className="dm-done-pts">
                +{confirmation.loyaltyPointsPending} points pending when the
                kitchen marks your order completed & paid
              </p>
            ) : null}
            {confirmation.loyaltyPointsBalance != null ? (
              <p className="dm-done-pts">
                Balance now: {confirmation.loyaltyPointsBalance} pts
              </p>
            ) : null}
            <button
              type="button"
              className="dm-btn dm-btn--primary"
              onClick={() => {
                setConfirmation(null);
                setPhase("landing");
                setCheckout({
                  name: customer?.name || "",
                  phone: customer?.phone || "",
                  paymentMethod: "Cash",
                  redeemPoints: 0,
                });
              }}
            >
              Back to menu
            </button>
          </div>
        </main>
      ) : null}

      {showRewardsPopup ? (
        <div className="dm-modal-scrim" role="presentation">
          <div className="dm-modal" role="dialog" aria-modal="true">
            <h2>Register Your Number & Earn Rewards</h2>
            <p>
              Earn {catalogue?.pointsPerOrder || 10} points on every successful
              eligible order. Redeem for discounts configured by {brandName}.
            </p>
            {error ? <p className="dm-banner dm-banner--error">{error}</p> : null}
            <label className="dm-field">
              Name
              <input
                value={rewardsForm.name}
                onChange={(event) =>
                  setRewardsForm((f) => ({ ...f, name: event.target.value }))
                }
              />
            </label>
            <label className="dm-field">
              Phone number
              <input
                value={rewardsForm.phone}
                onChange={(event) =>
                  setRewardsForm((f) => ({ ...f, phone: event.target.value }))
                }
                inputMode="tel"
                placeholder="03XX XXXXXXX"
              />
            </label>
            <div className="dm-modal-actions">
              <button
                type="button"
                className="dm-btn dm-btn--primary"
                disabled={submitting}
                onClick={registerRewards}
              >
                {submitting ? "Saving…" : "Register / Link rewards"}
              </button>
              <button
                type="button"
                className="dm-btn dm-btn--ghost"
                onClick={skipRewards}
              >
                Continue without rewards
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
