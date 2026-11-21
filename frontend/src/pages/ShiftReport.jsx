import { useCallback, useEffect, useMemo, useState } from "react";

import {
  authApi,
  errorMessage,
  ordersApi,
  reversalsApi,
  shiftsApi,
} from "../api/client";
import ModuleNav from "../components/ModuleNav";
import OmModal from "../components/orders/OmModal";
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  CartIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  FilterIcon,
  PlusIcon,
  PrinterIcon,
  RefreshIcon,
  SearchIcon,
  WalletIcon,
} from "../components/Icons";
import { MetricCard, PageNotice, Pagination, SelectFilter, StateBlock } from "../components/PosPageUi";
import { formatDateTime, formatMoney, toISODate } from "../utils/format";
import {
  CASH_DENOMINATIONS,
  buildClosingPreview,
  denomPayload,
  denomTotal,
  emptyDenomCounts,
  formatShiftDuration,
  printShiftClosingReport,
} from "../utils/shiftClosingReport";
import "./ModulePages.css";

const EMPTY_FILTERS = { dateFrom: "", dateTo: "", employeeId: "", status: "" };
const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function ShiftReport() {
  const [shifts, setShifts] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentShift, setCurrentShift] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState({ ...EMPTY_FILTERS, q: "" });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [reversals, setReversals] = useState([]);
  const [cashPulls, setCashPulls] = useState([]);
  const [closingTarget, setClosingTarget] = useState(null);
  const [closingCash, setClosingCash] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [denomCounts, setDenomCounts] = useState(() => emptyDenomCounts());
  const [openingDenomCounts, setOpeningDenomCounts] = useState(() => emptyDenomCounts());
  const [openingCash, setOpeningCash] = useState("0");
  const [showOpening, setShowOpening] = useState(false);
  const [exporting, setExporting] = useState(false);
  const openingDenomTotal = useMemo(
    () => denomTotal(openingDenomCounts),
    [openingDenomCounts]
  );

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus("loading");
    setError("");
    try {
      const filterParams = Object.fromEntries(
        Object.entries(applied).filter(([, value]) => value !== "")
      );
      const [list, current, options, identity] = await Promise.all([
        shiftsApi.list({
          ...filterParams,
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        shiftsApi.current(),
        shiftsApi.options(),
        authApi.me(),
      ]);
      setShifts(list.shifts);
      setTotal(list.total);
      setCurrentShift(current);
      setEmployees(
        (options.employees || []).filter(
          (employee) => !["Cashier", "Manager 2"].includes(employee.name)
        )
      );
      setUser(identity);
      setStatus("ready");
    } catch (problem) {
      const message = errorMessage(problem, "Could not load shift reports.");
      setError(message);
      setStatus((current) => (current === "loading" ? "error" : current));
      setNotice({ type: "error", text: message });
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

  const fetchShiftDetail = async (shift) => {
    setBusy(true);
    try {
      const detail = await shiftsApi.get(shift.id);
      const from = toISODate(detail.shift.openedAt);
      const to = toISODate(detail.shift.closedAt || new Date());
      const matchingOrders = [];
      let offset = 0;
      let orderCount = 0;
      do {
        const batch = await ordersApi.list({ dateFrom: from, dateTo: to, limit: 100, offset });
        matchingOrders.push(...batch.orders);
        orderCount = batch.total;
        offset += batch.orders.length;
      } while (offset < orderCount && offset < 10000);
      const inShift = matchingOrders.filter((order) => {
        const time = new Date(order.createdAt).getTime();
        return (
          Number(order.createdBy) === Number(detail.shift.employeeId) &&
          time >= new Date(detail.shift.openedAt).getTime() &&
          time <= new Date(detail.shift.closedAt || new Date()).getTime()
        );
      });
      const history = await reversalsApi.history({ dateFrom: from, dateTo: to, limit: 100 });
      const staffReversals = (history.reversals || []).filter(
        (reversal) => Number(reversal.performedBy) === Number(detail.shift.employeeId)
      );
      setSelectedShift(detail.shift);
      setCashPulls(detail.cashPulls || []);
      setTransactions(inShift);
      setReversals(staffReversals);
    } catch (problem) {
      setNotice({ type: "error", text: errorMessage(problem, "Could not load the shift report.") });
    } finally {
      setBusy(false);
    }
  };

  const updateOpeningDenomCount = (value, raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, "");
    setOpeningDenomCounts((current) => ({ ...current, [value]: cleaned }));
    const next = { ...openingDenomCounts, [value]: cleaned };
    setOpeningCash(String(denomTotal(next)));
  };

  const startShift = async () => {
    const denoms = denomPayload(openingDenomCounts);
    const counted = denomTotal(openingDenomCounts);
    const amount = denoms.length ? counted : Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setNotice({ type: "error", text: "Opening cash must be a non-negative amount." });
      return;
    }
    if (denoms.length && Math.abs(counted - amount) > 0.009) {
      setNotice({
        type: "error",
        text: "Opening cash must equal the denomination total.",
      });
      return;
    }
    setBusy(true);
    try {
      const result = await shiftsApi.open({
        openingCash: amount,
        denominations: denoms,
      });
      setShowOpening(false);
      setOpeningDenomCounts(emptyDenomCounts());
      setOpeningCash("0");
      setNotice({ type: "success", text: `${result.shift.shiftNumber} opened.` });
      await load({ silent: true });
    } catch (problem) {
      setNotice({ type: "error", text: errorMessage(problem, "Could not start the shift.") });
    } finally {
      setBusy(false);
    }
  };

  const openEndShift = async (shift) => {
    setBusy(true);
    setError("");
    try {
      const detail = await shiftsApi.get(shift.id);
      const fresh = detail.shift;
      setClosingTarget(fresh);
      // Actual cash comes only from counted denominations — never auto-fill from expected.
      setDenomCounts(emptyDenomCounts());
      setClosingCash("0");
      setClosingNotes("");
    } catch (problem) {
      setNotice({ type: "error", text: errorMessage(problem, "Could not load the shift for closing.") });
    } finally {
      setBusy(false);
    }
  };

  const updateDenomCount = (value, raw) => {
    const cleaned = String(raw).replace(/[^\d]/g, "");
    const next = { ...denomCounts, [value]: cleaned };
    setDenomCounts(next);
    // Actual cash is locked to the denomination total (no unexplained overrides).
    setClosingCash(String(denomTotal(next)));
  };

  const closingPreview = useMemo(() => {
    if (!closingTarget) return null;
    return buildClosingPreview(closingTarget, {
      closingCash: Number(closingCash) || 0,
      denominations: denomPayload(denomCounts),
      notes: closingNotes.trim(),
    });
  }, [closingTarget, closingCash, denomCounts, closingNotes]);

  const finishShift = async () => {
    const denoms = denomPayload(denomCounts);
    const counted = denomTotal(denomCounts);
    const amount = counted;
    if (!denoms.length) {
      setNotice({
        type: "error",
        text: "Count the drawer denominations. Actual cash must come from the note count.",
      });
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setNotice({ type: "error", text: "Enter the actual non-negative drawer cash." });
      return;
    }
    setClosingCash(String(counted));
    setBusy(true);
    try {
      const result = await shiftsApi.close(closingTarget.id, {
        closingCash: counted,
        notes: closingNotes.trim(),
        denominations: denoms,
      });
      setClosingTarget(null);
      setDenomCounts(emptyDenomCounts());
      setNotice({ type: "success", text: `${result.shift.shiftNumber} closed and its final report saved.` });
      await load({ silent: true });
      await fetchShiftDetail(result.shift);
    } catch (problem) {
      setNotice({ type: "error", text: errorMessage(problem, "Could not close the shift.") });
    } finally {
      setBusy(false);
    }
  };

  const printClosing = (shiftOrReport) => {
    if (!shiftOrReport) return;

    const saved = shiftOrReport.closingReport;
    if (saved?.shiftNumber) {
      printShiftClosingReport(saved, { businessName: "Amoons" });
      return;
    }

    if (shiftOrReport.shiftNumber && shiftOrReport.totals && shiftOrReport.denominations) {
      printShiftClosingReport(shiftOrReport, { businessName: "Amoons" });
      return;
    }

    printShiftClosingReport(
      buildClosingPreview(shiftOrReport, {
        closingCash: shiftOrReport.closingCash,
        denominations: shiftOrReport.denominations || denomPayload(denomCounts),
        notes: shiftOrReport.notes,
        closedAt: shiftOrReport.closedAt,
      }),
      { businessName: "Amoons" }
    );
  };

  const canClose = (shift) =>
    shift.status === "Open" && (user?.role === "admin" || Number(shift.employeeId) === Number(user?.id));

  const exportReport = async () => {
    setExporting(true);
    try {
      const params = Object.fromEntries(
        Object.entries(applied).filter(([, value]) => value !== "")
      );
      const all = [];
      let offset = 0;
      let count = 0;
      do {
        const batch = await shiftsApi.list({ ...params, limit: 100, offset });
        all.push(...batch.shifts);
        count = batch.total;
        offset += batch.shifts.length;
      } while (offset < count && offset < 10000);

      downloadCsv(`shift-report-${toISODate()}.csv`, [
        ["Shift ID", "User", "Start Time", "End Time", "Opening Cash", "Closing Cash", "Expected Cash", "Difference", "Total Sales", "Cash Sales", "Card Sales", "Other Payments", "Refunds", "Orders", "Status"],
        ...all.map((shift) => [
          shift.shiftNumber,
          shift.employeeName,
          formatDateTime(shift.openedAt),
          shift.closedAt ? formatDateTime(shift.closedAt) : "",
          shift.openingCash,
          shift.closingCash ?? "",
          shift.expectedCash,
          shift.difference ?? "",
          shift.totals.totalSales,
          shift.totals.cashSales,
          shift.totals.cardSales,
          shift.totals.onlineSales + shift.totals.aggregatorSales,
          shift.totals.reversedValue,
          shift.totals.orderCount,
          shift.status,
        ]),
      ]);
      setNotice({ type: "success", text: `Exported ${all.length} shift records.` });
    } catch (problem) {
      setNotice({ type: "error", text: errorMessage(problem, "Could not export shift reports.") });
    } finally {
      setExporting(false);
    }
  };

  const otherPayments = currentShift
    ? currentShift.totals.onlineSales + currentShift.totals.aggregatorSales
    : 0;
  const canStart = !currentShift;
  const currentUserName = user?.name || "Cashier";
  const currentShiftExpected =
    currentShift?.openingCash +
    (currentShift?.totals.cashReceived || 0) -
    (currentShift?.totals.cashRefunded || 0) -
    (currentShift?.totals.pullTotal || 0);

  const detailTotals = useMemo(() => selectedShift?.totals, [selectedShift]);

  return (
    <>
      <ModuleNav />
      <main className="om-page mp-page mp-shifts">
        <header className="om-head">
          <div className="module-title-icon"><CalendarIcon /></div>
          <div className="om-heading">
            <h1 className="om-title">Shift Report</h1>
            <p className="om-sub">View and analyze shift-wise sales, orders and activities.</p>
          </div>
          <div className="om-head-actions">
            {canStart ? (
              <button
                type="button"
                className="om-btn om-btn--primary"
                onClick={() => {
                  setOpeningDenomCounts(emptyDenomCounts());
                  setOpeningCash("0");
                  setShowOpening(true);
                }}
              >
                <PlusIcon className="om-btn-icon" /> Start Shift
              </button>
            ) : null}
            <button type="button" className="om-btn om-btn--ghost" onClick={() => load()} disabled={status === "loading"}><RefreshIcon className={`om-btn-icon${status === "loading" ? " om-spin" : ""}`} /> Refresh</button>
            <button type="button" className="om-btn om-btn--ghost" onClick={exportReport} disabled={exporting}><DownloadIcon className="om-btn-icon" /> {exporting ? "Exporting…" : "Export Report"}</button>
          </div>
        </header>

        <section className={`mp-banner${currentShift ? "" : " mp-banner--idle"}`} aria-label="Active shift">
          {currentShift ? <span className="mp-banner-check"><CheckCircleIcon /></span> : <span className="mp-banner-check mp-banner-check--idle"><ClockIcon /></span>}
          <div className="mp-banner-main">
            <p className="mp-banner-title">{currentShift ? `Shift #${currentShift.shiftNumber} is currently active` : "There is no active shift for this cashier"}</p>
            <p className="mp-banner-sub">
              {currentShift
                ? `Cashier: ${currentShift.employeeName} · Started ${formatDateTime(currentShift.openedAt)} · Expected cash ${formatMoney(currentShiftExpected)}`
                : `${currentUserName} · Start a shift to record the opening drawer balance.`}
            </p>
          </div>
          {currentShift && canClose(currentShift) ? (
            <button type="button" className="om-btn om-btn--primary" onClick={() => openEndShift(currentShift)} disabled={busy}>
              <span className="mp-stop-square" /> End Shift
            </button>
          ) : null}
        </section>

        <section className="om-cards" aria-label="Current shift summary">
          <MetricCard label="Total Sales" value={currentShift ? formatMoney(currentShift.totals.totalSales) : formatMoney(0)} hint="Sales excluding cancelled and reversed orders" icon={CartIcon} tone="burgundy" />
          <MetricCard label="Total Orders" value={currentShift?.totals.orderCount ?? 0} hint={currentShift ? `${currentShift.totals.cancelledOrders} cancelled · ${currentShift.totals.reversedOrders} reversed` : "No active shift"} icon={CheckCircleIcon} />
          <MetricCard label="Cash Sales" value={formatMoney(currentShift?.totals.cashSales ?? 0)} hint={`Cash received ${formatMoney(currentShift?.totals.cashReceived ?? 0)}`} icon={ArrowUpIcon} tone="green" />
          <MetricCard label="Card / Other Payments" value={formatMoney((currentShift?.totals.cardSales ?? 0) + otherPayments)} hint={`Refunds recorded ${formatMoney(currentShift?.totals.reversedValue ?? 0)}`} icon={ArrowDownIcon} tone="amber" />
        </section>

        <form className="om-filters" onSubmit={applyFilters}>
          <label className="om-search"><SearchIcon className="om-search-icon" /><input className="om-search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by Shift ID, User or Date…" aria-label="Search shifts" /></label>
          <div className="mp-filter-grid">
            <label className="mp-filter-label">From Date<input className="mp-date-input" type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} /></label>
            <label className="mp-filter-label">To Date<input className="mp-date-input" type="date" min={filters.dateFrom || undefined} value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} /></label>
            <SelectFilter label="User" value={filters.employeeId} onChange={(employeeId) => setFilters({ ...filters, employeeId })} options={[{ value: "", label: "All Users" }, ...employees.map((employee) => ({ value: String(employee.id), label: employee.name }))]} />
            <SelectFilter label="Status" value={filters.status} onChange={(status) => setFilters({ ...filters, status })} options={[{ value: "", label: "All Status" }, { value: "Open", label: "Active" }, { value: "Closed", label: "Completed" }]} />
            <button type="submit" className="om-btn om-btn--primary"><FilterIcon className="om-btn-icon" /> Apply Filters</button>
          </div>
        </form>

        <section className="om-table-card" aria-label="Shift records">
          <div className="om-table-scroll">
            <table className="om-table">
              <thead><tr><th>#</th><th>Shift ID</th><th>User</th><th>Start Time</th><th>End Time</th><th>Total Sales</th><th>Total Orders</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {status !== "ready" ? (
                  <tr><td colSpan="9"><StateBlock status={status} error={error} onRetry={load} /></td></tr>
                ) : shifts.length === 0 ? (
                  <tr><td colSpan="9"><StateBlock status="ready" empty="No shifts match these filters." /></td></tr>
                ) : shifts.map((shift, index) => (
                  <tr className="om-row" key={shift.id}>
                    <td data-label="#">{(page - 1) * pageSize + index + 1}</td>
                    <td data-label="Shift ID"><strong className="om-order-number">{shift.shiftNumber}</strong></td>
                    <td data-label="User">{shift.employeeName}</td>
                    <td data-label="Start Time">{formatDateTime(shift.openedAt)}</td>
                    <td data-label="End Time">{shift.closedAt ? formatDateTime(shift.closedAt) : "—"}</td>
                    <td data-label="Total Sales"><strong className="om-total-value">{formatMoney(shift.totals.totalSales)}</strong></td>
                    <td data-label="Total Orders">{shift.totals.orderCount}</td>
                    <td data-label="Status"><span className={`mp-status mp-status--${shift.status.toLowerCase()}`}><i />{shift.status === "Open" ? "Active" : "Completed"}</span></td>
                    <td data-label="Actions"><div className="mp-row-actions">
                      {canClose(shift) ? <button type="button" className="om-btn om-btn--primary om-btn--sm" onClick={() => openEndShift(shift)} disabled={busy}><span className="mp-stop-square" /> End Shift</button> : null}
                      <button type="button" className="om-btn om-btn--ghost om-btn--sm" onClick={() => fetchShiftDetail(shift)} disabled={busy}>{shift.status === "Open" ? "View" : "View report"}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {status === "ready" ? <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /> : null}
        </section>

        <PageNotice notice={notice} onDismiss={() => setNotice(null)} />

        {showOpening ? (
          <OmModal
            title="Start a shift"
            subtitle="Count the opening float by note. Total updates automatically."
            size="lg"
            onClose={() => setShowOpening(false)}
            footer={
              <>
                <button type="button" className="om-btn om-btn--ghost" onClick={() => setShowOpening(false)} disabled={busy}>Cancel</button>
                <button type="button" className="om-btn om-btn--primary" onClick={startShift} disabled={busy}>{busy ? "Starting…" : "Start shift"}</button>
              </>
            }
          >
            <section className="mp-close-panel" aria-label="Opening cash denomination counter">
              <div className="mp-close-panel-head">
                <h3>Cash denomination counter</h3>
                <p>Enter the quantity of each note. Opening cash is calculated from the counts.</p>
              </div>
              <div className="mp-denom-table-wrap">
                <table className="mp-denom-table">
                  <thead>
                    <tr>
                      <th>Note</th>
                      <th>Count</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CASH_DENOMINATIONS.map((value) => {
                      const count = Math.max(0, Math.trunc(Number(openingDenomCounts[value]) || 0));
                      return (
                        <tr key={value}>
                          <td>Rs. {value.toLocaleString("en-US")}</td>
                          <td>
                            <input
                              className="om-input mp-denom-input"
                              type="number"
                              min="0"
                              step="1"
                              inputMode="numeric"
                              value={openingDenomCounts[value]}
                              onChange={(event) => updateOpeningDenomCount(value, event.target.value)}
                              aria-label={`Opening count of Rs ${value} notes`}
                            />
                          </td>
                          <td>{formatMoney(value * count)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2">Opening cash total</td>
                      <td>{formatMoney(openingDenomTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
            <label className="mp-modal-field" style={{ marginTop: 12 }}>
              Opening cash (override)
              <input
                className="om-input"
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
              />
            </label>
          </OmModal>
        ) : null}

        {closingTarget && closingPreview ? (
          <OmModal
            title="Shift Closing Report"
            subtitle={`${closingTarget.shiftNumber} · ${closingTarget.employeeName} · Review totals, count cash, then confirm.`}
            size="lg"
            onClose={() => !busy && setClosingTarget(null)}
            footer={
              <>
                <button type="button" className="om-btn om-btn--ghost" onClick={() => setClosingTarget(null)} disabled={busy}>Keep shift open</button>
                <button type="button" className="om-btn om-btn--ghost" onClick={() => printClosing(closingPreview)} disabled={busy}>
                  <PrinterIcon className="om-btn-icon" /> Print report
                </button>
                <button type="button" className="om-btn om-btn--primary" onClick={finishShift} disabled={busy}>
                  {busy ? "Closing…" : "Confirm end shift"}
                </button>
              </>
            }
          >
            <div className="mp-close-hero">
              <div>
                <p className="mp-close-kicker">Shift duration</p>
                <strong>{formatShiftDuration(closingPreview.durationMs)}</strong>
                <span>{formatDateTime(closingTarget.openedAt)} — now</span>
              </div>
              <div>
                <p className="mp-close-kicker">Net revenue</p>
                <strong>{formatMoney(closingPreview.totals.netRevenue)}</strong>
                <span>Sales − refunds − expenses</span>
              </div>
              <div className={`mp-close-variance mp-close-variance--${closingPreview.difference === 0 ? "ok" : closingPreview.difference > 0 ? "over" : "short"}`}>
                <p className="mp-close-kicker">Cash difference</p>
                <strong>{formatMoney(closingPreview.difference)}</strong>
                <span>{closingPreview.difference === 0 ? "Drawer balanced" : closingPreview.difference > 0 ? "Cash over" : "Cash short"}</span>
              </div>
            </div>

            <div className="mp-close-summary">
              <p><span>Total sales</span><strong>{formatMoney(closingPreview.totals.totalSales)}</strong></p>
              <p><span>Cash sales</span><strong>{formatMoney(closingPreview.totals.cashSales)}</strong></p>
              <p><span>Card sales</span><strong>{formatMoney(closingPreview.totals.cardSales)}</strong></p>
              <p><span>Online sales</span><strong>{formatMoney(closingPreview.totals.onlineSales)}</strong></p>
              <p><span>Refunds</span><strong>{formatMoney(closingPreview.totals.refunds)}</strong></p>
              <p><span>Expenses</span><strong>{formatMoney(closingPreview.totals.expenses)}</strong></p>
              <p><span>Total orders</span><strong>{closingPreview.totals.orderCount ?? 0}</strong></p>
              <p><span>Completed</span><strong>{closingPreview.totals.completedOrders ?? 0}</strong></p>
              <p><span>Cancelled / reversed</span><strong>{(closingPreview.totals.cancelledOrders || 0) + (closingPreview.totals.reversedOrders || 0)}</strong></p>
            </div>

            <div className="mp-close-layout">
              <section className="mp-close-panel" aria-label="Cash denomination counter">
                <div className="mp-close-panel-head">
                  <h3>Cash denomination counter</h3>
                  <p>Enter note counts. Actual cash updates automatically.</p>
                </div>
                <div className="mp-denom-table-wrap">
                  <table className="mp-denom-table">
                    <thead>
                      <tr>
                        <th>Note</th>
                        <th>Count</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {CASH_DENOMINATIONS.map((value) => {
                        const count = Math.max(0, Math.trunc(Number(denomCounts[value]) || 0));
                        return (
                          <tr key={value}>
                            <td>Rs. {value.toLocaleString("en-US")}</td>
                            <td>
                              <input
                                className="om-input mp-denom-input"
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={denomCounts[value]}
                                onChange={(event) => updateDenomCount(value, event.target.value)}
                                aria-label={`Count of Rs ${value} notes`}
                              />
                            </td>
                            <td>{formatMoney(value * count)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="2">Counted total</td>
                        <td>{formatMoney(denomTotal(denomCounts))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              <section className="mp-close-panel" aria-label="Cash reconciliation">
                <div className="mp-close-panel-head">
                  <h3>Cash reconciliation</h3>
                  <p>Expected cash is recalculated from live POS transactions at close.</p>
                </div>
                <div className="mp-close-reconcile">
                  <p><span>Opening cash</span><strong>{formatMoney(closingTarget.openingCash)}</strong></p>
                  <p><span>Cash received</span><strong>{formatMoney(closingTarget.totals.cashReceived)}</strong></p>
                  <p><span>Cash refunded</span><strong>{formatMoney(closingTarget.totals.cashRefunded)}</strong></p>
                  <p><span>Cash pulls / expenses</span><strong>{formatMoney(closingTarget.totals.pullTotal)}</strong></p>
                  <p><span>Expected cash</span><strong>{formatMoney(closingPreview.expectedCash)}</strong></p>
                  <label className="mp-modal-field">
                    Actual cash (from denomination count)
                    <input
                      className="om-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={closingCash}
                      readOnly
                      title="Actual cash is calculated from the note counts above"
                    />
                  </label>
                  <p className={`mp-close-diff mp-close-diff--${closingPreview.difference === 0 ? "ok" : closingPreview.difference > 0 ? "over" : "short"}`}>
                    <span>{closingPreview.difference === 0 ? "Difference" : closingPreview.difference > 0 ? "Over" : "Short"}</span>
                    <strong>{formatMoney(closingPreview.difference)}</strong>
                  </p>
                </div>
                <label className="mp-modal-field">
                  Closing note (optional)
                  <textarea
                    className="om-input"
                    rows="3"
                    maxLength="500"
                    value={closingNotes}
                    onChange={(event) => setClosingNotes(event.target.value)}
                    placeholder="Over/short reason, handover notes…"
                  />
                </label>
              </section>
            </div>
          </OmModal>
        ) : null}

        {selectedShift ? (
          <OmModal
            title={`Shift report · ${selectedShift.shiftNumber}`}
            subtitle={`${selectedShift.employeeName} · ${formatDateTime(selectedShift.openedAt)}${selectedShift.closedAt ? ` — ${formatDateTime(selectedShift.closedAt)}` : " — Active"}${selectedShift.closedAt ? ` · ${formatShiftDuration(new Date(selectedShift.closedAt).getTime() - new Date(selectedShift.openedAt).getTime())}` : ""}`}
            size="lg"
            onClose={() => setSelectedShift(null)}
            footer={
              <>
                <button type="button" className="om-btn om-btn--ghost" onClick={() => setSelectedShift(null)}>Close</button>
                <button
                  type="button"
                  className="om-btn om-btn--primary"
                  onClick={() => printClosing(selectedShift.closingReport || selectedShift)}
                >
                  <PrinterIcon className="om-btn-icon" /> Print closing report
                </button>
              </>
            }
          >
            <div className="mp-detail-grid">
              <MetricCard label="Opening cash" value={formatMoney(selectedShift.openingCash)} icon={WalletIcon} />
              <MetricCard label="Closing cash" value={selectedShift.closingCash == null ? "Open" : formatMoney(selectedShift.closingCash)} icon={CheckCircleIcon} />
              <MetricCard label="Expected cash" value={formatMoney(selectedShift.expectedCash)} icon={ArrowUpIcon} />
              <MetricCard label="Difference" value={selectedShift.difference == null ? "—" : formatMoney(selectedShift.difference)} hint={selectedShift.difference == null ? "Counted on close" : selectedShift.difference === 0 ? "Drawer balanced" : selectedShift.difference > 0 ? "Over" : "Short"} icon={AlertIcon} />
              <MetricCard label="Total sales" value={formatMoney(detailTotals?.totalSales ?? 0)} icon={CartIcon} />
              <MetricCard label="Cash sales" value={formatMoney(detailTotals?.cashSales ?? 0)} icon={ArrowUpIcon} />
              <MetricCard label="Card sales" value={formatMoney(detailTotals?.cardSales ?? 0)} icon={WalletIcon} />
              <MetricCard label="Online sales" value={formatMoney((detailTotals?.onlineSales ?? 0) + (detailTotals?.aggregatorSales ?? 0))} icon={WalletIcon} />
              <MetricCard label="Refunds" value={formatMoney(detailTotals?.reversedValue ?? 0)} icon={ArrowDownIcon} />
              <MetricCard label="Expenses" value={formatMoney(detailTotals?.pullTotal ?? 0)} icon={ArrowDownIcon} />
              <MetricCard label="Net revenue" value={formatMoney(detailTotals?.netRevenue ?? 0)} icon={CheckCircleIcon} />
              <MetricCard label="Orders" value={`${detailTotals?.orderCount ?? 0} · ${detailTotals?.completedOrders ?? 0} done`} icon={CheckCircleIcon} />
            </div>
            {selectedShift.closingReport?.denominations?.length ? (
              <>
                <h3 className="mp-detail-heading">Cash denominations</h3>
                <div className="om-table-scroll">
                  <table className="om-table">
                    <thead><tr><th>Note</th><th>Count</th><th>Amount</th></tr></thead>
                    <tbody>
                      {selectedShift.closingReport.denominations.map((row) => (
                        <tr key={row.value}>
                          <td>Rs. {row.value}</td>
                          <td>{row.count}</td>
                          <td>{formatMoney(row.value * row.count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
            <h3 className="mp-detail-heading">Order transactions</h3>
            {transactions.length ? (
              <div className="om-table-scroll">
                <table className="om-table"><thead><tr><th>Order</th><th>Time</th><th>Payment</th><th>Total</th><th>Status</th></tr></thead>
                  <tbody>{transactions.map((order) => <tr key={order.id}><td>{order.orderNumber}<span className="om-cell-sub">{order.items.map((item) => item.name).join(", ")}</span></td><td>{formatDateTime(order.createdAt)}</td><td>{order.paymentMethod} · {formatMoney(order.amountPaid)}</td><td>{formatMoney(order.total)}</td><td>{order.status}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="om-muted">No order transactions are recorded in this shift window.</p>}
            <h3 className="mp-detail-heading">Cash pulls</h3>
            {cashPulls.length ? <ul className="mp-record-list">{cashPulls.map((pull) => <li key={pull.id}><strong>{formatMoney(pull.amount)}</strong><span>{pull.reason} · {pull.employeeName} · {formatDateTime(pull.createdAt)}</span></li>)}</ul> : <p className="om-muted">No cash pulls were recorded.</p>}
            <h3 className="mp-detail-heading">Reversal records</h3>
            {reversals.length ? <ul className="mp-record-list">{reversals.map((reversal) => <li key={reversal.id}><strong>{reversal.orderNumber} · {formatMoney(reversal.amountPaid)}</strong><span>{reversal.reason} · {reversal.performedByName} · {formatDateTime(reversal.createdAt)}</span></li>)}</ul> : <p className="om-muted">No reversals were recorded in this shift window.</p>}
          </OmModal>
        ) : null}
      </main>
    </>
  );
}

export default ShiftReport;
