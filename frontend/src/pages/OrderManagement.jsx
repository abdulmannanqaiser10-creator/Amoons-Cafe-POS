import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  adminApi,
  companyApi,
  ordersApi,
  errorMessage,
  settingsApi,
} from "../api/client";
import ConfirmDialog from "../components/orders/ConfirmDialog";
import OmModal from "../components/orders/OmModal";
import {
  AlertIcon,
  ArrowLeftIcon,
  CardIcon,
  CartIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  FilterIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "../components/Icons";
import {
  MetricCard,
  PageNotice,
  Pagination,
  SelectFilter,
  StateBlock,
} from "../components/PosPageUi";
import {
  CLOSED_STATUSES,
  ORDER_CHANNELS,
  LEGACY_ORDER_CHANNELS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "../data/orderConstants";
import { formatDateTime, formatMoney } from "../utils/format";
import { playOrderAlertTone } from "../utils/printer";
import { printReceipt } from "../utils/receipt";
import "./ModulePages.css";

const INITIAL_FILTERS = {
  channel: "",
  paymentMethod: "",
  paymentStatus: "",
  dateFrom: "",
  dateTo: "",
};

function MoreIconGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function StatusBadge({ value }) {
  const tone = String(value || "").toLowerCase();
  return <span className={`mp-status mp-status--${tone}`}>{value || "Unknown"}</span>;
}

function OrderManagement({ mode = "staff" } = {}) {
  const navigate = useNavigate();
  const isAdmin = mode === "admin";
  const backTo = isAdmin ? "/admin" : "/home";
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [applied, setApplied] = useState({ ...INITIAL_FILTERS, q: "" });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [selected, setSelected] = useState(null);
  const [action, setAction] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [cancelOrder, setCancelOrder] = useState(null);
  const [deleteOrder, setDeleteOrder] = useState(null);
  const knownIdsRef = useRef(new Set());
  const primedRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus("loading");
    setError("");

    try {
      const params = {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        ...Object.fromEntries(
          Object.entries(applied).filter(([, value]) => value !== "")
        ),
      };
      const [list, summary] = await Promise.all([
        ordersApi.list(params),
        ordersApi.stats(),
      ]);
      const rows = list.orders || [];

      if (!primedRef.current) {
        knownIdsRef.current = new Set(rows.map((order) => order.id));
        primedRef.current = true;
      } else {
        const incoming = rows.filter((order) => !knownIdsRef.current.has(order.id));
        if (incoming.length) {
          incoming.forEach((order) => knownIdsRef.current.add(order.id));
          const order = incoming[0];
          const isWeb =
            order.channel === "Web" ||
            !order.createdBy ||
            /website/i.test(order.note || "");
          setNotice({
            type: "success",
            text: isWeb
              ? `New Web order ${order.orderNumber}`
              : `New order ${order.orderNumber}`,
          });
          window.setTimeout(() => setNotice(null), 4500);
          if (isWeb) playOrderAlertTone();
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(
              isWeb
                ? `Web order ${order.orderNumber}`
                : `New order ${order.orderNumber}`,
              {
                body: `${formatMoney(order.total)} · ${order.channel}${
                  order.customerName ? ` · ${order.customerName}` : ""
                }`,
              }
            );
          }
        }
        rows.forEach((order) => knownIdsRef.current.add(order.id));
      }

      setOrders(rows);
      setTotal(list.total);
      setStats(summary);
      setStatus("ready");
    } catch (problem) {
      setError(errorMessage(problem, "Could not load orders."));
      setStatus((current) => (current === "loading" ? "error" : current));
    }
  }, [applied, page, pageSize]);

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
    const timer = window.setInterval(() => load({ silent: true }), 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  const showNotice = (type, text) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), type === "error" ? 6000 : 3500);
  };

  const applyFilters = (event) => {
    event.preventDefault();
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      showNotice("error", "The start date must be on or before the end date.");
      return;
    }
    setPage(1);
    setApplied({ ...filters, q: query.trim() });
  };

  const loadOrder = async (order) => {
    try {
      setSelected(await ordersApi.get(order.id));
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not load order details."));
    }
  };

  const printOrder = async (order) => {
    if (busy) return;
    setBusy(true);
    try {
      // Always reload the order so edited/new lines are included on the receipt.
      const full = await ordersApi.get(order.id);
      if (!full?.items?.length) {
        throw new Error("This order has no line items to print.");
      }

      const [settings, profile] = await Promise.all([
        settingsApi.getPrinter().catch(() => ({ printer: { paperWidth: 80, copies: 1 } })),
        companyApi.get().catch(() => null),
      ]);

      const items = (full.items || []).map((item) => ({
        ...item,
        productId: Number(item.productId) || item.productId,
        price: Number(item.price) || 0,
        quantity: Number(item.quantity) || 0,
        lineTotal:
          item.lineTotal != null
            ? Number(item.lineTotal)
            : (Number(item.price) || 0) * (Number(item.quantity) || 0),
      }));

      const subtotal =
        Number(full.subtotal) ||
        items.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0);
      const discountAmount = Number(full.discountAmount) || 0;
      const taxTotal = Number(full.taxTotal ?? full.taxAmount) || 0;
      const total = Number(full.total) || 0;
      const amountPaid = Number(full.amountPaid) || 0;

      const receiptOrder = {
        ...full,
        items,
        subtotal,
        discountAmount,
        discountType: full.discountType || "none",
        discountPercent: Number(full.discountPercent || full.discountPercentage) || 0,
        discountPercentage: Number(full.discountPercent || full.discountPercentage) || 0,
        taxTotal,
        taxAmount: taxTotal,
        taxRate: Number(full.taxRate) || 0,
        total,
        amountPaid,
        balanceDue: Math.max(0, total - amountPaid),
        customerName: full.customerName || "",
        customerPhone: full.customerPhone || "",
        paymentMethod: full.paymentMethod,
        paymentStatus: full.paymentStatus,
        status: full.status,
        channel: full.channel,
        riderName: full.riderName || "",
        riderPhone: full.riderPhone || "",
        deliveryAddress: full.deliveryAddress || "",
        note: full.note || "",
        createdAt: full.createdAt,
        orderNumber: full.orderNumber,
      };

      const sent = await printReceipt(receiptOrder, {
        paperWidth: settings.printer?.paperWidth ?? 80,
        copies: settings.printer?.copies ?? 1,
        business: profile?.settings?.business,
        receipt: profile?.settings?.receipt,
      });
      if (!sent) throw new Error("Printing is not available in this browser.");
      showNotice(
        "success",
        `Complete receipt opened for ${full.orderNumber} (${items.length} items).`
      );
      await load({ silent: true });
      if (selected?.id === full.id) setSelected(full);
    } catch (problem) {
      showNotice("error", errorMessage(problem, problem.message || "Could not print the receipt."));
    } finally {
      setBusy(false);
    }
  };

  const editOrder = (order) => {
    if (CLOSED_STATUSES.includes(order.status)) {
      showNotice("error", `${order.orderNumber} cannot be edited.`);
      return;
    }
    navigate("/home", { state: { editOrderId: order.id } });
  };

  const updateOrderStatus = async () => {
    if (!action || !newStatus) return;
    setBusy(true);
    try {
      await ordersApi.updateStatus(action.id, newStatus);
      setAction(null);
      showNotice("success", `${action.orderNumber} status updated.`);
      await load({ silent: true });
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not update order status."));
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async () => {
    if (!action) return;
    const amount = Number(amountPaid);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(action.total)) {
      showNotice("error", "Enter a paid amount between zero and the order total.");
      return;
    }
    setBusy(true);
    try {
      await ordersApi.updatePayment(action.id, { amountPaid: amount, paymentMethod });
      setAction(null);
      showNotice("success", `Payment recorded for ${action.orderNumber}.`);
      await load({ silent: true });
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not record payment."));
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelOrder) return;
    setBusy(true);
    try {
      await ordersApi.cancel(cancelOrder.id);
      setCancelOrder(null);
      showNotice("success", `${cancelOrder.orderNumber} cancelled.`);
      await load({ silent: true });
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not cancel this order."));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteOrder || !isAdmin) return;
    setBusy(true);
    try {
      await ordersApi.remove(deleteOrder.id);
      setDeleteOrder(null);
      setSelected((current) => (current?.id === deleteOrder.id ? null : current));
      showNotice("success", `${deleteOrder.orderNumber} deleted.`);
      await load({ silent: true });
    } catch (problem) {
      showNotice("error", errorMessage(problem, "Could not delete this order."));
    } finally {
      setBusy(false);
    }
  };

  const kitchenOrders = (stats?.pending ?? 0) + (stats?.preparing ?? 0) + (stats?.ready ?? 0);

  return (
    <main className={`om-page mp-page${isAdmin ? " mp-page--admin" : ""}`}>
      <header className="om-head">
        <button type="button" className="om-back" onClick={() => navigate(backTo)}>
          <ArrowLeftIcon className="om-back-icon" /> Back
        </button>
        <div className="om-heading">
          <h1 className="om-title">Order Management</h1>
          <p className="om-sub">
            {isAdmin
              ? "Admin view of every till order — update, cancel, or permanently delete."
              : "View and manage all orders placed on the till."}
          </p>
        </div>
        <div className="om-head-actions">
          <button type="button" className="om-btn om-btn--ghost" onClick={() => load()} disabled={status === "loading"}>
            <RefreshIcon className={`om-btn-icon${status === "loading" ? " om-spin" : ""}`} />
            Refresh
          </button>
          <button type="button" className="om-btn om-btn--primary" onClick={() => navigate("/home")}>
            <PlusIcon className="om-btn-icon" /> New Order
          </button>
        </div>
      </header>

      <section className="om-cards" aria-label="Today's order summary">
        <MetricCard label="Orders Today" value={stats?.todayOrders ?? "—"} hint="Created today" icon={CartIcon} />
        <MetricCard label="Revenue Today" value={stats ? formatMoney(stats.todayRevenue) : "—"} hint="Sales excluding cancellations and reversals" icon={CardIcon} tone="burgundy" />
        <MetricCard label="In The Kitchen" value={stats ? kitchenOrders : "—"} hint={`${stats?.pending ?? 0} pending · ${stats?.preparing ?? 0} preparing · ${stats?.ready ?? 0} ready`} icon={ClockIcon} />
        <MetricCard label="Outstanding" value={stats ? formatMoney(stats.outstanding) : "—"} hint={`${stats?.unpaidOrders ?? 0} unpaid or partial orders`} icon={AlertIcon} tone="amber" />
      </section>

      <form className="om-filters" onSubmit={applyFilters}>
        <label className="om-search">
          <SearchIcon className="om-search-icon" />
          <input
            type="search"
            className="om-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by Order ID, Customer or Item…"
            aria-label="Search orders"
          />
        </label>
        <div className="mp-filter-grid">
          <SelectFilter label="Channel" value={filters.channel} onChange={(channel) => setFilters({ ...filters, channel })} options={[{ value: "", label: "All" }, ...[...ORDER_CHANNELS, ...LEGACY_ORDER_CHANNELS].map((value) => ({ value, label: value }))]} />
          <SelectFilter label="Payment Method" value={filters.paymentMethod} onChange={(paymentMethod) => setFilters({ ...filters, paymentMethod })} options={[{ value: "", label: "All" }, ...PAYMENT_METHODS.map((value) => ({ value, label: value }))]} />
          <SelectFilter label="Payment Status" value={filters.paymentStatus} onChange={(paymentStatus) => setFilters({ ...filters, paymentStatus })} options={[{ value: "", label: "All" }, ...PAYMENT_STATUSES.map((value) => ({ value, label: value }))]} />
          <label className="mp-filter-label">From<input className="mp-date-input" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
          <label className="mp-filter-label">To<input className="mp-date-input" type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
          <button type="submit" className="om-btn om-btn--primary"><FilterIcon className="om-btn-icon" /> Apply</button>
        </div>
      </form>

      <section className="om-table-card" aria-label="Orders">
        <div className="om-table-scroll">
          <table className="om-table">
            <thead>
              <tr><th>#</th><th>Order ID</th><th>Items</th><th>Channel</th><th>Payment</th><th>Rider</th><th>Status</th><th>Total</th><th className="om-col-actions">Actions</th></tr>
            </thead>
            <tbody>
              {status !== "ready" ? (
                <tr><td colSpan="9"><StateBlock status={status} error={error} onRetry={load} /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan="9"><StateBlock status="ready" empty="No orders match these filters." /></td></tr>
              ) : orders.map((order, index) => (
                <tr className="om-row" key={order.id}>
                  <td data-label="#">{(page - 1) * pageSize + index + 1}</td>
                  <td data-label="Order ID"><button type="button" className="om-row-trigger om-order-number" onClick={() => loadOrder(order)}>{order.orderNumber}</button><span className="om-cell-sub">{formatDateTime(order.createdAt)}</span></td>
                  <td data-label="Items"><span className="om-cell-strong om-cell-truncate">{order.items.map((item) => item.name).join(", ") || "No items"}</span><span className="om-cell-sub">({order.itemCount} {order.itemCount === 1 ? "item" : "items"})</span></td>
                  <td data-label="Channel"><span className={`om-badge om-badge--ch-${order.channel.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{order.channel}</span></td>
                  <td data-label="Payment"><div className="om-payment-cell"><span className={`om-badge om-badge--pm-${order.paymentMethod.toLowerCase()}`}>{order.paymentMethod} · {formatMoney(order.amountPaid)}</span><StatusBadge value={order.paymentStatus} /></div></td>
                  <td data-label="Rider">{order.riderName || <span className="om-muted">—</span>}</td>
                  <td data-label="Status"><StatusBadge value={order.status} /></td>
                  <td data-label="Total"><strong className="om-total-value">{formatMoney(order.total)}</strong></td>
                  <td data-label="Actions" className="om-col-actions">
                    <div className="om-actions">
                      <button type="button" className="om-action" title="View order" aria-label={`View ${order.orderNumber}`} onClick={() => loadOrder(order)}><span className="om-action-glyph"><EyeIcon /></span></button>
                      <button
                        type="button"
                        className="om-action"
                        title="Edit order"
                        aria-label={`Edit ${order.orderNumber}`}
                        onClick={() => editOrder(order)}
                        disabled={CLOSED_STATUSES.includes(order.status) || busy}
                      >
                        <span className="om-action-glyph"><PencilIcon /></span>
                      </button>
                      <button type="button" className="om-action" title="Print Complete Receipt" aria-label={`Print complete receipt for ${order.orderNumber}`} onClick={() => printOrder(order)} disabled={busy}><span className="om-action-glyph"><PrinterIcon /></span></button>
                      {isAdmin ? (
                        <button
                          type="button"
                          className="om-action om-action--danger"
                          title="Delete order"
                          aria-label={`Delete ${order.orderNumber}`}
                          onClick={() => setDeleteOrder(order)}
                        >
                          <span className="om-action-glyph"><TrashIcon /></span>
                        </button>
                      ) : null}
                      <div className="mp-action-menu">
                        <button type="button" className="om-action" title="More actions" aria-label={`More actions for ${order.orderNumber}`} aria-expanded={openMenu === order.id} onClick={() => setOpenMenu(openMenu === order.id ? null : order.id)}><span className="om-action-glyph"><MoreIconGlyph /></span></button>
                        {openMenu === order.id ? (
                          <div className="mp-action-menu-list" role="menu">
                            <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); setAction(order); setNewStatus(order.status); }}>Update status</button>
                            <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); setAction({ ...order, actionType: "payment" }); setAmountPaid(String(order.amountPaid)); setPaymentMethod(PAYMENT_METHODS.includes(order.paymentMethod) ? order.paymentMethod : "Cash"); }}>Record payment</button>
                            <button type="button" role="menuitem" disabled={["Cancelled", "Reversed"].includes(order.status)} onClick={() => { setOpenMenu(null); setCancelOrder(order); }}>Cancel order</button>
                            {isAdmin ? (
                              <button
                                type="button"
                                role="menuitem"
                                className="mp-action-danger"
                                onClick={() => { setOpenMenu(null); setDeleteOrder(order); }}
                              >
                                Delete order
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {status === "ready" ? (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        ) : null}
      </section>

      <PageNotice notice={notice} onDismiss={() => setNotice(null)} />

      {selected ? (
        <OmModal
          title={selected.orderNumber}
          subtitle={`Placed ${formatDateTime(selected.createdAt)}`}
          size="lg"
          onClose={() => setSelected(null)}
          footer={
            <>
              {isAdmin &&
              !selected.srbInvoiceId &&
              !["Cancelled", "Reversed"].includes(selected.status) ? (
                <button
                  type="button"
                  className="om-btn om-btn--primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await adminApi.srb.submitOrder(selected.id);
                      const order = result.order || selected;
                      setSelected(order);
                      setOrders((rows) =>
                        rows.map((row) => (row.id === order.id ? { ...row, ...order } : row))
                      );
                      setNotice({
                        type: result.result?.ok || result.order?.srbInvoiceId ? "success" : "error",
                        text:
                          result.message ||
                          (order.srbInvoiceId
                            ? `SRB invoice ${order.srbInvoiceId}`
                            : "SRB submission failed."),
                      });
                      window.setTimeout(() => setNotice(null), 4500);
                    } catch (problem) {
                      const data = problem?.response?.data;
                      if (data?.order) {
                        setSelected(data.order);
                        setOrders((rows) =>
                          rows.map((row) =>
                            row.id === data.order.id ? { ...row, ...data.order } : row
                          )
                        );
                      }
                      setNotice({
                        type: "error",
                        text: data?.message || errorMessage(problem, "SRB submission failed."),
                      });
                      window.setTimeout(() => setNotice(null), 5000);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Submitting…" : "Submit to SRB"}
                </button>
              ) : null}
              <button type="button" className="om-btn om-btn--ghost" onClick={() => setSelected(null)}>
                Close
              </button>
            </>
          }
        >
          <div className="om-cards om-cards--inner">
            <MetricCard label="Total" value={formatMoney(selected.total)} icon={CardIcon} />
            <MetricCard label="Paid" value={formatMoney(selected.amountPaid)} icon={CheckCircleIcon} tone="green" />
            <MetricCard label="Balance due" value={formatMoney(selected.balanceDue)} icon={AlertIcon} tone="amber" />
          </div>
          <div className="om-table-scroll">
            <table className="om-table">
              <thead><tr><th>Item</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead>
              <tbody>{selected.items.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.quantity}</td><td>{formatMoney(item.price)}</td><td>{formatMoney(item.lineTotal)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="mp-detail-line"><b>Customer / Phone:</b> {selected.customerPhone || selected.customerName || "—"} · <b>Channel:</b> {selected.channel} · <b>Payment:</b> {selected.paymentMethod} ({selected.paymentStatus})</p>
          {selected.riderName ? <p className="mp-detail-line"><b>Rider:</b> {selected.riderName} · {selected.riderPhone}</p> : null}
          {selected.note ? <p className="mp-detail-line"><b>Note:</b> {selected.note}</p> : null}
          <p className="mp-detail-line">
            <b>SRB:</b>{" "}
            {selected.srbInvoiceId
              ? `${selected.srbInvoiceId} (${selected.srbStatus || "Submitted"})`
              : selected.srbStatus
                ? `${selected.srbStatus}${selected.srbError ? ` — ${selected.srbError}` : ""}`
                : "Not submitted"}
          </p>
          {selected.srbInvoiceId || selected.srbQrLink ? (
            <p className="mp-detail-line">
              <b>Verify:</b>{" "}
              <a
                href={
                  selected.srbQrLink ||
                  `https://apps.srb.gos.pk/InvoiceVerification/MobileInvoiceStatus.jsp?invoiceVerification=${encodeURIComponent(selected.srbInvoiceId)}`
                }
                target="_blank"
                rel="noreferrer"
              >
                Open SRB verification
              </a>
              <span className="om-muted"> · QR prints on the receipt</span>
            </p>
          ) : null}
        </OmModal>
      ) : null}

      {action ? (
        <OmModal
          title={action.actionType === "payment" ? `Record payment · ${action.orderNumber}` : `Update status · ${action.orderNumber}`}
          onClose={() => setAction(null)}
          footer={action.actionType === "payment" ? (
            <button type="button" className="om-btn om-btn--primary" onClick={savePayment} disabled={busy}>{busy ? "Saving…" : "Save payment"}</button>
          ) : (
            <button type="button" className="om-btn om-btn--primary" onClick={updateOrderStatus} disabled={busy || !newStatus}>{busy ? "Saving…" : "Update status"}</button>
          )}
        >
          {action.actionType === "payment" ? (
            <div className="mp-dialog-form">
              <label>Amount paid<input className="om-input" type="number" min="0" max={action.total} step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(event.target.value)} /></label>
              <SelectFilter label="Payment method" value={paymentMethod} onChange={setPaymentMethod} options={PAYMENT_METHODS.map((value) => ({ value, label: value }))} />
            </div>
          ) : (
            <div className="mp-dialog-form">
              <label>New status
                <select className="om-select" value={newStatus} onChange={(event) => setNewStatus(event.target.value)}>
                  {ORDER_STATUSES.filter((value) => value !== "Reversed").map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
            </div>
          )}
        </OmModal>
      ) : null}

      {cancelOrder ? (
        <ConfirmDialog
          title={`Cancel ${cancelOrder.orderNumber}?`}
          message="The order will be closed and its stock adjustments will be recorded. This cannot be undone."
          confirmLabel={busy ? "Cancelling…" : "Cancel order"}
          busy={busy}
          onConfirm={confirmCancel}
          onCancel={() => setCancelOrder(null)}
        />
      ) : null}

      {isAdmin && deleteOrder ? (
        <ConfirmDialog
          title={`Delete ${deleteOrder.orderNumber}?`}
          message="This permanently removes the order from the database. Stock for open sales is restored. This cannot be undone."
          confirmLabel={busy ? "Deleting…" : "Delete order"}
          busy={busy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteOrder(null)}
        />
      ) : null}
    </main>
  );
}

export default OrderManagement;
