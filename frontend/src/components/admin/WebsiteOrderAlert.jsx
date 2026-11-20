import { useCallback, useEffect, useRef, useState } from "react";

import { companyApi, errorMessage, ordersApi, settingsApi } from "../../api/client";
import { formatDateTime, formatMoney } from "../../utils/format";
import { playWebsiteOrderAlert, printSaleBundle } from "../../utils/printer";
import { printReceipt } from "../../utils/receipt";

const POLL_MS = 5000;
const SEEN_KEY = "softpos.website-order-seen";

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
    const list = [...ids].slice(-200);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function parseNoteLines(note = "") {
  return String(note)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Admin-wide realtime website order watcher:
 * polls Web channel intake, plays an alert, and shows an action popup.
 */
export default function WebsiteOrderAlert() {
  const [queue, setQueue] = useState([]);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const knownRef = useRef(null);
  const profilesRef = useRef({ business: null, receipt: null, printer: null });
  const loadingDetailRef = useRef(false);

  useEffect(() => {
    let activeLoad = true;
    Promise.all([companyApi.get().catch(() => null), settingsApi.getPrinter().catch(() => null)])
      .then(([company, printerResult]) => {
        if (!activeLoad) return;
        profilesRef.current = {
          business: company?.settings?.business || null,
          receipt: company?.settings?.receipt || null,
          printer: printerResult?.printer || null,
        };
      });
    return () => {
      activeLoad = false;
    };
  }, []);

  const poll = useCallback(async () => {
    try {
      const result = await ordersApi.list({
        channel: "Web",
        limit: 30,
        offset: 0,
      });
      const rows = (result.orders || []).filter(isWebsiteOrder);

      if (!knownRef.current) {
        knownRef.current = loadSeen();
        rows.forEach((order) => knownRef.current.add(Number(order.id)));
        // Also seed any older IDs already in session storage.
        saveSeen(knownRef.current);
        return;
      }

      const fresh = rows
        .filter((order) => !knownRef.current.has(Number(order.id)))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

      if (!fresh.length) return;

      fresh.forEach((order) => knownRef.current.add(Number(order.id)));
      saveSeen(knownRef.current);
      playWebsiteOrderAlert();
      setQueue((current) => {
        const existing = new Set(current.map((row) => Number(row.id)));
        const next = [...current];
        fresh.forEach((order) => {
          if (!existing.has(Number(order.id))) next.push(order);
        });
        return next;
      });
    } catch {
      /* keep polling quietly so the admin shell stays responsive */
    }
  }, []);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [poll]);

  useEffect(() => {
    if (active || !queue.length || loadingDetailRef.current) return;

    const next = queue[0];
    loadingDetailRef.current = true;
    setError("");
    setNotice("");

    ordersApi
      .get(next.id)
      .then((full) => {
        setActive(full);
        setQueue((current) => current.filter((row) => Number(row.id) !== Number(next.id)));
      })
      .catch((problem) => {
        setError(errorMessage(problem, "Could not load the website order."));
        setQueue((current) => current.filter((row) => Number(row.id) !== Number(next.id)));
      })
      .finally(() => {
        loadingDetailRef.current = false;
      });
  }, [active, queue]);

  const printOptions = () => ({
    paperWidth: Number(profilesRef.current.printer?.paperWidth) === 58 ? 58 : 80,
    copies: Number(profilesRef.current.printer?.copies) || 1,
    business: profilesRef.current.business,
    receipt: profilesRef.current.receipt,
  });

  const runPrint = async (mode) => {
    if (!active || busy) return;
    setBusy(true);
    setError("");
    try {
      const latest = await ordersApi.get(active.id);
      setActive(latest);
      if (mode === "kitchen") {
        await printSaleBundle(latest, { ...printOptions(), mode: "kitchen" });
        setNotice(`Kitchen ticket sent for ${latest.orderNumber}.`);
      } else {
        const sent = await printReceipt(latest, printOptions());
        if (!sent) throw new Error("Printing is not available in this browser.");
        setNotice(`Customer bill sent for ${latest.orderNumber}.`);
      }
    } catch (problem) {
      setError(errorMessage(problem, problem.message || "Print failed."));
    } finally {
      setBusy(false);
    }
  };

  const completeOrder = async () => {
    if (!active || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await ordersApi.updateStatus(active.id, "Completed");
      setNotice(`${updated.orderNumber} marked completed.`);
      window.setTimeout(() => {
        setActive(null);
        setNotice("");
      }, 450);
    } catch (problem) {
      setError(errorMessage(problem, "Could not complete the order."));
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    if (busy) return;
    setActive(null);
    setError("");
    setNotice("");
  };

  if (!active) return null;

  const items = active.items || [];
  const notes = parseNoteLines(active.note);
  const waiting = queue.length;

  return (
    <div className="woa-overlay" role="presentation">
      <div
        className="woa-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`New website order ${active.orderNumber}`}
      >
        <header className="woa-head">
          <div className="woa-pulse" aria-hidden="true" />
          <div className="woa-head-copy">
            <p className="woa-kicker">New Website Order Received!</p>
            <h2>{active.orderNumber}</h2>
            <p className="woa-sub">
              {formatDateTime(active.createdAt)} · {active.channel} · {active.status}
              {waiting ? ` · ${waiting} more waiting` : ""}
            </p>
          </div>
          <button type="button" className="woa-close" onClick={dismiss} disabled={busy} aria-label="Dismiss">
            ×
          </button>
        </header>

        <div className="woa-body">
          <section className="woa-meta" aria-label="Customer details">
            <div>
              <span>Customer</span>
              <strong>{active.customerName || "Guest"}</strong>
            </div>
            <div>
              <span>Phone</span>
              <strong>{active.customerPhone || "—"}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong>
                {active.paymentMethod} · {active.paymentStatus}
              </strong>
            </div>
            <div>
              <span>Total</span>
              <strong className="woa-total">{formatMoney(active.total)}</strong>
            </div>
          </section>

          {notes.length ? (
            <section className="woa-notes" aria-label="Order notes">
              {notes.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </section>
          ) : null}

          <section className="woa-items" aria-label="Order items">
            <div className="woa-items-head">
              <span>Item</span>
              <span>Qty</span>
              <span>Amount</span>
            </div>
            <ul>
              {items.length ? (
                items.map((item, index) => (
                  <li key={`${item.productId || item.name}-${index}`}>
                    <span className="woa-item-name">
                      {item.name}
                      {item.category ? <small>{item.category}</small> : null}
                    </span>
                    <span>×{item.quantity}</span>
                    <span>
                      {formatMoney(
                        item.lineTotal != null
                          ? item.lineTotal
                          : Number(item.price || 0) * Number(item.quantity || 0)
                      )}
                    </span>
                  </li>
                ))
              ) : (
                <li className="woa-empty">No line items on this order.</li>
              )}
            </ul>
            <div className="woa-totals">
              <p>
                <span>Subtotal</span>
                <strong>{formatMoney(active.subtotal)}</strong>
              </p>
              {Number(active.discountAmount) > 0 ? (
                <p>
                  <span>Discount</span>
                  <strong>-{formatMoney(active.discountAmount)}</strong>
                </p>
              ) : null}
              {Number(active.taxTotal ?? active.taxAmount) > 0 ? (
                <p>
                  <span>Tax</span>
                  <strong>{formatMoney(active.taxTotal ?? active.taxAmount)}</strong>
                </p>
              ) : null}
              <p className="woa-totals-grand">
                <span>Total</span>
                <strong>{formatMoney(active.total)}</strong>
              </p>
            </div>
          </section>

          {error ? (
            <p className="woa-banner woa-banner--error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="woa-banner woa-banner--ok" role="status">
              {notice}
            </p>
          ) : null}
        </div>

        <footer className="woa-actions">
          <button
            type="button"
            className="woa-btn woa-btn--ghost"
            onClick={() => runPrint("kitchen")}
            disabled={busy}
          >
            Print KOT
          </button>
          <button
            type="button"
            className="woa-btn woa-btn--ghost"
            onClick={() => runPrint("bill")}
            disabled={busy}
          >
            Print Bill
          </button>
          <button
            type="button"
            className="woa-btn woa-btn--primary"
            onClick={completeOrder}
            disabled={busy || active.status === "Completed"}
          >
            {busy ? "Working…" : active.status === "Completed" ? "Completed" : "Order Completed"}
          </button>
        </footer>
      </div>
    </div>
  );
}
