import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ordersApi } from "../api/client";
import { formatDateTime, formatMoney } from "../utils/format";
import { playWebsiteOrderAlert } from "../utils/printer";

const POLL_MS = 5000;
const SEEN_KEY = "softpos.pos-website-order-seen";

function isWebsiteOrder(order) {
  return (
    order?.channel === "Web" ||
    !order?.createdBy ||
    /website/i.test(order?.note || "")
  );
}

function loadSeen() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(Number) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* ignore */
  }
}

/**
 * POS till notice for new website / platform orders.
 * Shows a clear popup with “New Website Order Received!” and a View Order action.
 */
export default function PosWebsiteOrderNotice() {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const knownRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const result = await ordersApi.list({ channel: "Web", limit: 20, offset: 0 });
      const rows = (result.orders || []).filter(isWebsiteOrder);

      if (!knownRef.current) {
        knownRef.current = loadSeen();
        rows.forEach((order) => knownRef.current.add(Number(order.id)));
        saveSeen(knownRef.current);
        return;
      }

      const fresh = rows
        .filter((order) => !knownRef.current.has(Number(order.id)))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      if (!fresh.length) return;

      fresh.forEach((order) => knownRef.current.add(Number(order.id)));
      saveSeen(knownRef.current);
      playWebsiteOrderAlert();
      setActive((current) => current || fresh[0]);
    } catch {
      /* keep till responsive */
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  if (!active) return null;

  return (
    <div className="pwo-overlay" role="presentation">
      <div
        className="pwo-card"
        role="dialog"
        aria-modal="true"
        aria-label="New website order received"
      >
        <div className="pwo-pulse" aria-hidden="true" />
        <p className="pwo-kicker">Online intake</p>
        <h2>New Website Order Received!</h2>
        <p className="pwo-order">{active.orderNumber}</p>
        <div className="pwo-meta">
          <span>{formatDateTime(active.createdAt)}</span>
          <span>{formatMoney(active.total)}</span>
          <span>{active.customerName || active.customerPhone || "Guest"}</span>
          <span>{active.paymentMethod} · {active.status}</span>
        </div>
        <div className="pwo-actions">
          <button
            type="button"
            className="pwo-btn pwo-btn--ghost"
            onClick={() => setActive(null)}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="pwo-btn pwo-btn--primary"
            onClick={() => {
              const id = active.id;
              setActive(null);
              navigate("/orders", { state: { highlightOrderId: id } });
            }}
          >
            View Order
          </button>
        </div>
      </div>
    </div>
  );
}
