import { useCallback, useEffect, useState } from "react";

import {
  ordersApi,
  reversalsApi,
  errorMessage,
} from "../api/client";
import ModuleNav from "../components/ModuleNav";
import OmModal from "../components/orders/OmModal";
import {
  AlertIcon,
  CheckCircleIcon,
  DownloadIcon,
  FilterIcon,
  RefreshIcon,
  ReverseIcon,
  SearchIcon,
  CartIcon,
  WalletIcon,
} from "../components/Icons";
import { MetricCard, PageNotice, Pagination, SelectFilter, StateBlock } from "../components/PosPageUi";
import { ORDER_CHANNELS, LEGACY_ORDER_CHANNELS, PAYMENT_METHODS, PAYMENT_STATUSES } from "../data/orderConstants";
import { formatDateTime, formatMoney, toISODate } from "../utils/format";
import "./ModulePages.css";

const EMPTY_FILTERS = {
  channel: "",
  paymentMethod: "",
  paymentStatus: "",
  dateFrom: "",
  dateTo: "",
};

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function downloadCsv(filename, rows) {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ value }) {
  return <span className={`mp-status mp-status--${String(value || "").toLowerCase()}`}>{value || "Unknown"}</span>;
}

function OrderReversal() {
  const [tab, setTab] = useState("all");
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [reversibleCount, setReversibleCount] = useState(0);
  const [refundTotal, setRefundTotal] = useState(0);
  const [reversedToday, setReversedToday] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState({ ...EMPTY_FILTERS, q: "" });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [orderToReverse, setOrderToReverse] = useState(null);
  const [reason, setReason] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [manualRefundConfirmed, setManualRefundConfirmed] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus("loading");
    setError("");
    try {
      const filterParams = Object.fromEntries(
        Object.entries(applied).filter(([, value]) => value !== "")
      );
      const listParams = {
        ...filterParams,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        ...(tab === "reversible" ? { reversible: true } : {}),
      };
      const today = toISODate();
      const [list, all, reversible, allReversals, todayReversals] = await Promise.all([
        ordersApi.list(listParams),
        ordersApi.list({ ...filterParams, limit: 1 }),
        ordersApi.list({ ...filterParams, reversible: true, limit: 1 }),
        reversalsApi.history({ limit: 1 }),
        reversalsApi.history({ dateFrom: today, dateTo: today, limit: 1 }),
      ]);
      setOrders(list.orders);
      setTotal(list.total);
      setAllCount(all.total);
      setReversibleCount(reversible.total);
      setRefundTotal(allReversals.amountReversed);
      setReversedToday(todayReversals.total);
      setStatus("ready");
    } catch (problem) {
      setError(errorMessage(problem, "Could not load reversal data."));
      setStatus((current) => (current === "loading" ? "error" : current));
      setNotice({ type: "error", text: errorMessage(problem, "Could not refresh reversal data.") });
    }
  }, [applied, page, pageSize, tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setApplied((current) => ({ ...current, q: query.trim() }));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setInterval(() => load({ silent: true }), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const applyFilters = (event) => {
    event.preventDefault();
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setNotice({ type: "error", text: "The start date must be on or before the end date." });
      return;
    }
    setPage(1);
    setApplied({ ...filters, q: query.trim() });
  };

  const beginReversal = (order) => {
    setOrderToReverse(order);
    setReason("");
    setManagerPin("");
    setManualRefundConfirmed(false);
  };

  const submitReversal = async () => {
    if (!orderToReverse || reason.trim().length < 4 || !manualRefundConfirmed) return;
    setBusy(true);
    try {
      await ordersApi.reverse(orderToReverse.id, {
        reason: reason.trim(),
        ...(managerPin.trim() ? { managerPin: managerPin.trim() } : {}),
      });
      setOrderToReverse(null);
      setNotice({
        type: "success",
        text: `${orderToReverse.orderNumber}: reversal and refund record saved. Process the payment-provider refund separately if applicable.`,
      });
      await load({ silent: true });
    } catch (problem) {
      setNotice({ type: "error", text: errorMessage(problem, "The order was not reversed.") });
    } finally {
      setBusy(false);
    }
  };

  const exportRows = async () => {
    setExporting(true);
    try {
      const params = Object.fromEntries(
        Object.entries(applied).filter(([, value]) => value !== "")
      );
      const allRows = [];
      let offset = 0;
      let count = 0;
      do {
        const batch = await ordersApi.list({
          ...params,
          ...(tab === "reversible" ? { reversible: true } : {}),
          limit: 100,
          offset,
        });
        allRows.push(...batch.orders);
        count = batch.total;
        offset += batch.orders.length;
      } while (offset < count && offset < 10000);

      downloadCsv(`order-reversals-${toISODate()}.csv`, [
        ["Order ID", "Customer", "Items", "Channel", "Payment method", "Paid", "Total", "Order time", "Status", "Reversible"],
        ...allRows.map((order) => [
          order.orderNumber,
          order.customerPhone || order.customerName,
          order.items.map((item) => `${item.quantity} x ${item.name}`).join("; "),
          order.channel,
          order.paymentMethod,
          order.amountPaid,
          order.total,
          formatDateTime(order.createdAt),
          order.status,
          order.reversible ? "Yes" : "No",
        ]),
      ]);
      setNotice({ type: "success", text: `Exported ${allRows.length} matching orders.` });
    } catch (problem) {
      setNotice({ type: "error", text: errorMessage(problem, "Could not export orders.") });
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <ModuleNav />
      <main className="om-page mp-page mp-reversals">
        <header className="om-head">
          <div className="module-title-icon"><ReverseIcon /></div>
          <div className="om-heading">
            <h1 className="om-title">Order Reversal</h1>
            <p className="om-sub">Select an order to reverse and record its refund.</p>
          </div>
          <div className="om-head-actions">
            <button type="button" className="om-btn om-btn--ghost" onClick={() => load()} disabled={status === "loading"}>
              <RefreshIcon className={`om-btn-icon${status === "loading" ? " om-spin" : ""}`} /> Refresh
            </button>
            <button type="button" className="om-btn om-btn--ghost" onClick={exportRows} disabled={exporting}>
              <DownloadIcon className="om-btn-icon" /> {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </header>

        <section className="om-cards" aria-label="Reversal summary">
          <MetricCard label="Total Orders" value={allCount} hint="Matching order records" icon={CartIcon} />
          <MetricCard label="Reversible Orders" value={reversibleCount || 0} hint="Eligible, not yet reversed" icon={AlertIcon} tone="burgundy" />
          <MetricCard label="Reversed Today" value={reversedToday} hint="Audit records created today" icon={CheckCircleIcon} />
          <MetricCard label="Total Refund" value={formatMoney(refundTotal)} hint="Amount paid recorded in reversals" icon={WalletIcon} tone="red" />
        </section>

        <div className="mp-tabs" role="tablist" aria-label="Order list">
          <button type="button" role="tab" aria-selected={tab === "all"} className={`mp-tab${tab === "all" ? " mp-tab--active" : ""}`} onClick={() => { setTab("all"); setPage(1); }}>
            All Orders ({allCount})
          </button>
          <button type="button" role="tab" aria-selected={tab === "reversible"} className={`mp-tab${tab === "reversible" ? " mp-tab--active" : ""}`} onClick={() => { setTab("reversible"); setPage(1); }}>
            Reversible Only ({reversibleCount})
          </button>
        </div>

        <form className="om-filters" onSubmit={applyFilters}>
          <label className="om-search">
            <SearchIcon className="om-search-icon" />
            <input className="om-search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by Order ID, Customer or Item…" aria-label="Search order reversals" />
          </label>
          <div className="mp-filter-grid">
            <SelectFilter label="Channel" value={filters.channel} onChange={(channel) => setFilters({ ...filters, channel })} options={[{ value: "", label: "All" }, ...[...ORDER_CHANNELS, ...LEGACY_ORDER_CHANNELS].map((value) => ({ value, label: value }))]} />
            <SelectFilter label="Payment Method" value={filters.paymentMethod} onChange={(paymentMethod) => setFilters({ ...filters, paymentMethod })} options={[{ value: "", label: "All" }, ...PAYMENT_METHODS.map((value) => ({ value, label: value }))]} />
            <SelectFilter label="Payment Status" value={filters.paymentStatus} onChange={(paymentStatus) => setFilters({ ...filters, paymentStatus })} options={[{ value: "", label: "All" }, ...PAYMENT_STATUSES.map((value) => ({ value, label: value }))]} />
            <label className="mp-filter-label">From<input className="mp-date-input" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
            <label className="mp-filter-label">To<input className="mp-date-input" type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
            <button type="submit" className="om-btn om-btn--primary"><FilterIcon className="om-btn-icon" /> Apply</button>
          </div>
        </form>

        {hasFilters ? <div className="mp-filter-summary">Applied filters are active. Update the fields and choose Apply to change the result set.</div> : null}

        <section className="om-table-card" aria-label="Orders eligible for reversal">
          <div className="om-table-scroll">
            <table className="om-table">
              <thead><tr><th>#</th><th>Order ID</th><th>Items</th><th>Channel</th><th>Payment</th><th>Total</th><th>Order Time</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {status !== "ready" ? (
                  <tr><td colSpan="9"><StateBlock status={status} error={error} onRetry={load} /></td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan="9"><StateBlock status="ready" empty="No orders match the selected filters." /></td></tr>
                ) : orders.map((order, index) => (
                  <tr className="om-row" key={order.id}>
                    <td data-label="#">{(page - 1) * pageSize + index + 1}</td>
                    <td data-label="Order ID"><strong className="om-order-number">{order.orderNumber}</strong><span className="om-cell-sub">{order.customerPhone || order.customerName || "Walk-in"}</span></td>
                    <td data-label="Items"><span className="om-cell-strong">{order.items.map((item) => item.name).join(", ") || "No items"}</span><span className="om-cell-sub">({order.itemCount} {order.itemCount === 1 ? "item" : "items"})</span></td>
                    <td data-label="Channel"><span className={`om-badge om-badge--ch-${order.channel.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{order.channel}</span></td>
                    <td data-label="Payment">{order.paymentMethod} · {formatMoney(order.amountPaid)}<span className="om-cell-sub">{order.paymentStatus}</span></td>
                    <td data-label="Total"><strong className="om-total-value">{formatMoney(order.total)}</strong></td>
                    <td data-label="Order Time">{formatDateTime(order.createdAt)}</td>
                    <td data-label="Status"><StatusBadge value={order.status} /></td>
                    <td data-label="Action"><button type="button" className="om-btn om-btn--danger om-btn--sm" disabled={!order.reversible} onClick={() => beginReversal(order)}><ReverseIcon className="om-btn-icon" /> {order.reversible ? "Reverse" : order.status === "Reversed" ? "Reversed" : "Unavailable"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {status === "ready" ? <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /> : null}
        </section>

        <PageNotice notice={notice} onDismiss={() => setNotice(null)} />
        {orderToReverse ? (
          <OmModal
            title={`Reverse ${orderToReverse.orderNumber}?`}
            subtitle="The POS creates an immutable reversal and records who authorized it."
            size="md"
            onClose={() => !busy && setOrderToReverse(null)}
            footer={
              <>
                <button type="button" className="om-btn om-btn--ghost" onClick={() => setOrderToReverse(null)} disabled={busy}>Keep order</button>
                <button type="button" className="om-btn om-btn--danger" onClick={submitReversal} disabled={busy || reason.trim().length < 4 || !manualRefundConfirmed}>
                  <ReverseIcon className="om-btn-icon" /> {busy ? "Recording…" : "Confirm reversal"}
                </button>
              </>
            }
          >
            <div className="mp-reversal-details">
              <p><b>Customer / Phone:</b> {orderToReverse.customerPhone || orderToReverse.customerName || "Walk-in"}</p>
              <p><b>Order total:</b> {formatMoney(orderToReverse.total)} · <b>Paid:</b> {formatMoney(orderToReverse.amountPaid)}</p>
              <p><b>Method:</b> {orderToReverse.paymentMethod} · <b>Status:</b> {orderToReverse.status}</p>
              <p><b>Items:</b> {orderToReverse.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</p>
            </div>
            <label className="mp-modal-field">Reversal reason (required)
              <textarea className="om-input" rows="3" maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why this order is being reversed" />
            </label>
            <label className="mp-modal-field">Manager PIN (if your account is not authorized)
              <input className="om-input" type="password" inputMode="numeric" maxLength="5" value={managerPin} onChange={(event) => setManagerPin(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="5-digit PIN" />
            </label>
            <label className="mp-confirm-refund">
              <input type="checkbox" checked={manualRefundConfirmed} onChange={(event) => setManualRefundConfirmed(event.target.checked)} />
              <span>I have processed the external refund manually, or no external payment refund is due. This app has no configured payment-gateway refund integration.</span>
            </label>
          </OmModal>
        ) : null}
      </main>
    </>
  );
}

export default OrderReversal;
