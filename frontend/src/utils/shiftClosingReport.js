import { PRINT_VENDOR_LINE } from "./branding";
import { formatDateTime, formatMoney } from "./format";
import { printHtml } from "./receipt";

/** Pakistani rupee note denominations used for drawer counting. */
export const CASH_DENOMINATIONS = [5000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export function emptyDenomCounts() {
  return Object.fromEntries(CASH_DENOMINATIONS.map((value) => [value, ""]));
}

export function denomTotal(counts) {
  return CASH_DENOMINATIONS.reduce((sum, value) => {
    const count = Math.max(0, Math.trunc(Number(counts?.[value]) || 0));
    return sum + value * count;
  }, 0);
}

export function denomPayload(counts) {
  return CASH_DENOMINATIONS.map((value) => ({
    value,
    count: Math.max(0, Math.trunc(Number(counts?.[value]) || 0)),
  })).filter((row) => row.count > 0);
}

export function formatShiftDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours <= 0) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

export function buildClosingPreview(shift, { closingCash, denominations, notes, closedAt } = {}) {
  const totals = shift?.totals || {};
  const onlineSales = Number(totals.onlineSales || 0) + Number(totals.aggregatorSales || 0);
  const expenses = Number(totals.pullTotal || 0);
  const refunds = Number(totals.reversedValue || 0);
  const totalSales = Number(totals.totalSales || 0);
  const expectedCash = Number(
    shift?.expectedCash ??
      Number(shift?.openingCash || 0) +
        Number(totals.cashReceived || 0) -
        Number(totals.cashRefunded || 0) -
        expenses
  );
  const actualCash = Number(closingCash ?? shift?.closingCash ?? 0);
  const end = closedAt || shift?.closedAt || new Date().toISOString();
  const start = shift?.openedAt;
  const durationMs = Math.max(0, new Date(end).getTime() - new Date(start).getTime());

  return {
    generatedAt: new Date().toISOString(),
    shiftNumber: shift?.shiftNumber,
    employeeName: shift?.employeeName,
    employeeId: shift?.employeeId,
    branchName: shift?.branchName,
    openedAt: start,
    closedAt: end,
    durationMs,
    openingCash: Number(shift?.openingCash || 0),
    expectedCash,
    closingCash: actualCash,
    difference: Math.round((actualCash - expectedCash) * 100) / 100,
    denominations: denominations || [],
    denominationTotal: (denominations || []).reduce(
      (sum, row) => sum + Number(row.value || 0) * Number(row.count || 0),
      0
    ),
    notes: notes || shift?.notes || "",
    totals: {
      ...totals,
      onlineSales,
      expenses,
      refunds,
      netRevenue: Math.round((totalSales - refunds - expenses) * 100) / 100,
    },
  };
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneyRow(label, value, strong = false) {
  return `<div class="r${strong ? " strong" : ""}"><span>${esc(label)}</span><span>${esc(formatMoney(value))}</span></div>`;
}

function textRow(label, value) {
  if (value === "" || value == null) return "";
  return `<div class="r"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

/**
 * Prints a professional Shift Closing / Z-report on the POS printer paper.
 */
export function printShiftClosingReport(report, { businessName } = {}) {
  const totals = report?.totals || {};
  const difference = Number(report?.difference || 0);
  const varianceLabel =
    difference === 0 ? "Balanced" : difference > 0 ? "Cash over" : "Cash short";

  const denoms = (report?.denominations || []).filter((row) => Number(row.count) > 0);
  const denomRows = denoms.length
    ? `<table><thead><tr><th>Note</th><th class="n">Qty</th><th class="n">Amount</th></tr></thead><tbody>${denoms
        .map(
          (row) =>
            `<tr><td>Rs. ${esc(row.value)}</td><td class="n">${esc(row.count)}</td><td class="n">${esc(
              formatMoney(Number(row.value) * Number(row.count))
            )}</td></tr>`
        )
        .join("")}</tbody></table>`
    : `<p class="empty">No denomination counts recorded.</p>`;

  const bodyHtml = `
    <header>
      <h1>${esc(businessName || "Amoons")}</h1>
      <p>Shift Closing Report</p>
      <div class="pill">${esc(report?.shiftNumber || "Shift")}</div>
    </header>
    <div class="meta">
      ${textRow("Cashier", report?.employeeName)}
      ${textRow("Branch", report?.branchName)}
      ${textRow("Opened", formatDateTime(report?.openedAt))}
      ${textRow("Closed", formatDateTime(report?.closedAt))}
      ${textRow("Duration", formatShiftDuration(report?.durationMs))}
    </div>
    <h2>Sales summary</h2>
    ${moneyRow("Total sales", totals.totalSales, true)}
    ${moneyRow("Cash sales", totals.cashSales)}
    ${moneyRow("Card sales", totals.cardSales)}
    ${moneyRow("Online sales", totals.onlineSales)}
    ${moneyRow("Refunds", totals.refunds ?? totals.reversedValue)}
    ${moneyRow("Expenses / pulls", totals.expenses ?? totals.pullTotal)}
    ${moneyRow("Net revenue", totals.netRevenue, true)}
    <h2>Orders</h2>
    ${textRow("Total orders", totals.orderCount ?? 0)}
    ${textRow("Completed", totals.completedOrders ?? 0)}
    ${textRow("Cancelled", totals.cancelledOrders ?? 0)}
    ${textRow("Reversed", totals.reversedOrders ?? 0)}
    <h2>Cash reconciliation</h2>
    ${moneyRow("Opening cash", report?.openingCash)}
    ${moneyRow("Expected cash", report?.expectedCash)}
    ${moneyRow("Actual cash", report?.closingCash, true)}
    ${moneyRow(varianceLabel, difference, true)}
    <h2>Cash denominations</h2>
    ${denomRows}
    ${
      report?.notes
        ? `<h2>Notes</h2><p class="notes">${esc(report.notes)}</p>`
        : ""
    }
    <footer>
      <p>End of shift report</p>
      <p class="tiny">Generated ${esc(formatDateTime(report?.generatedAt || new Date().toISOString()))}</p>
      <p class="powered">${esc(PRINT_VENDOR_LINE)}</p>
    </footer>
  `;

  const css = `
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{width:80mm;max-width:80mm;padding:5mm 4mm;font:700 12px/1.4 Arial,Helvetica,sans-serif;color:#000}
    header{text-align:center;border-bottom:2px dashed #222;padding-bottom:8px;margin-bottom:8px}
    h1{font-size:16px;font-weight:800;letter-spacing:1px;text-transform:uppercase}
    header p{font-size:11px;margin-top:2px}
    .pill{display:inline-block;margin-top:6px;border:2px solid #000;border-radius:3px;padding:3px 8px;font-size:12px;font-weight:800}
    .meta{border-bottom:2px dashed #222;padding:7px 0;margin-bottom:8px}
    h2{margin:10px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #000;padding-bottom:2px}
    .r{display:flex;justify-content:space-between;gap:8px;margin:2px 0}
    .r span:first-child{text-transform:uppercase;font-size:10px;letter-spacing:.3px}
    .r span:last-child{text-align:right;font-weight:800;max-width:62%}
    .r.strong span{font-size:13px}
    table{width:100%;border-collapse:collapse;margin:6px 0}
    th,td{padding:3px 0;font-size:11px}
    th{text-align:left;border-bottom:1px solid #000;text-transform:uppercase;font-size:10px}
    th.n,td.n{text-align:right}
    td{border-bottom:1px dotted #666}
    .empty,.notes{font-size:11px;margin-top:4px}
    .notes{white-space:pre-wrap}
    footer{text-align:center;margin-top:10px;border-top:2px dashed #222;padding-top:8px}
    footer .tiny{font-size:9px;margin-top:3px}
    footer .powered{margin-top:6px;font-size:8px;font-weight:700;line-height:1.35;word-break:break-word}
    @page{size:80mm auto;margin:0}
    @media print{body{width:80mm}}
  `;

  return printHtml({
    title: `Shift Closing · ${report?.shiftNumber || "Report"}`,
    bodyHtml,
    css,
  });
}
