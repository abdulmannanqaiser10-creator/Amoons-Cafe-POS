import QRCode from "qrcode";

import { BRAND, DELIVERY_CHANNELS } from "../data/orderConstants";
import { PRINT_VENDOR_LINE, srbVerificationUrl } from "./branding";
import { formatDateTime, formatMoney } from "./format";
import { getDisplayPreferences } from "./preferences";
import {
  printSaleBundle,
  printReceipt as printReceiptJob,
  printKitchenTicket as printKitchenTicketJob,
  printKitchenAndBill as printKitchenAndBillJob,
  printerSettings,
  loadPrinterSettings,
} from "./printer";
import { buildEscPos } from "./escpos";
import { printRawToNetwork } from "./printTransport";

let businessProfile = null;
let receiptProfile = null;

export function applyReceiptProfile({ business, receipt } = {}) {
  businessProfile = business ?? null;
  receiptProfile = receipt ?? null;
}

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function row(label, value) {
  if (value === "" || value == null) return "";
  return `<div class="r"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
}

/** HTML preview CSS (reference layout for documentation / rare browser fallback). */
export const baseCss = (width) => {
  const narrow = width < 70;
  return `
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${width}mm;margin:0 auto;padding:4mm 3mm;font-family:Arial,sans-serif;font-size:${narrow ? 14 : 15}px;font-weight:700;text-align:center;color:#000}
  header,footer{text-align:center}
  h1{font-size:${narrow ? 18 : 20}px;font-weight:900;text-transform:uppercase}
  .pill{display:inline-block;border:2px solid #000;padding:3px 10px;font-weight:900;margin-top:6px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  td,th{padding:6px 2px;border-bottom:1px solid #000;text-align:center;font-weight:700}
  .tot td{font-size:${narrow ? 16 : 17}px;font-weight:900;border-top:2px solid #000}
  .kot-qty,.kot-name{font-weight:900;font-size:${narrow ? 16 : 17}px}
`;
};

async function srbQrBlock(order) {
  const url = srbVerificationUrl(order);
  if (!url) return "";
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
      color: { dark: "#000000", light: "#ffffff" },
    });
    return `<div class="srb-qr"><img src="${dataUrl}" alt="SRB QR" width="220" height="220" /></div>`;
  } catch {
    return "";
  }
}

export async function receiptMarkup(order) {
  applyReceiptProfile({
    business: businessProfile,
    receipt: receiptProfile,
  });
  const displayPreferences = getDisplayPreferences();
  const business = businessProfile || {};
  const receipt = receiptProfile || {};
  const showBusinessName = receipt.showBusinessName !== false;
  const businessName = showBusinessName ? business.name || BRAND.name : "";
  const srbQr = await srbQrBlock(order);
  const lines = (order.items || [])
    .map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const lineTotal =
        item.lineTotal != null ? Number(item.lineTotal) : price * qty;
      return `<tr><td>${esc(item.name)}<em>${esc(`${qty} × ${formatMoney(price)}`)}</em></td><td class="n">${esc(formatMoney(lineTotal))}</td></tr>`;
    })
    .join("");

  return `
    <header>
      ${businessName ? `<h1>${esc(businessName)}</h1>` : ""}
      <p class="pill">${esc(order.orderNumber)}</p>
    </header>
    <div class="meta">
      ${row("Placed", formatDateTime(order.createdAt))}
      ${row("Channel", order.channel)}
      ${row("Status", order.status)}
    </div>
    <table>
      <thead><tr><th>Item</th><th class="n">Amount</th></tr></thead>
      <tbody>${lines || `<tr><td colspan="2">No items</td></tr>`}</tbody>
      <tfoot>
        <tr class="sub"><td>Subtotal</td><td class="n">${esc(formatMoney(order.subtotal))}</td></tr>
        <tr class="tot"><td>Total</td><td class="n">${esc(formatMoney(order.total))}</td></tr>
      </tfoot>
    </table>
    ${displayPreferences.showOrderDetails ? `<div class="meta">${row("Note", order.note)}</div>` : ""}
    <footer>
      <p>${esc(receipt.footerMessage || "Thank you for your order.")}</p>
      ${srbQr}
      <p class="tiny">${esc(PRINT_VENDOR_LINE)}</p>
    </footer>
  `;
}

export function kitchenMarkup(order) {
  const lines = (order.items || [])
    .map(
      (item) =>
        `<tr><td class="kot-qty">${esc(item.quantity)} ×</td><td class="kot-name">${esc(item.name)}${item.category ? `<em>${esc(item.category)}</em>` : ""}</td></tr>`
    )
    .join("");
  return `
    <header>
      <h1>Kitchen ticket</h1>
      <p class="pill">${esc(order.orderNumber)}</p>
      <p>${esc(order.channel)}</p>
    </header>
    <table><tbody>${lines || '<tr><td colspan="2">No items</td></tr>'}</tbody></table>
    <footer><p class="tiny">${esc(new Date().toLocaleString("en-GB"))}</p></footer>
  `;
}

/**
 * Silent direct print. HTML args kept for shift-report compatibility;
 * jobs are sent as ESC/POS via Local Print Agent / Android native bridge.
 */
export async function printHtml({
  title,
  bodyHtml,
  order = null,
  kind = "bill",
  paperWidth,
  businessName = "",
}) {
  await loadPrinterSettings();
  const cfg = printerSettings();
  const host =
    cfg.frontCashier?.networkHost ||
    cfg.networkHost ||
    "";
  if (!host) {
    throw new Error("Set the Front Cashier printer IP in Printer Settings.");
  }

  if (order) {
    await printSaleBundle(order, {
      mode: kind === "kot" || kind === "kitchen" ? "kitchen" : "bill",
      business: { name: businessName || businessProfile?.name || "Amoons" },
    });
    return true;
  }

  // Text-only jobs (e.g. shift report): encode plain body as centered ESC/POS lines.
  const width = Number(paperWidth) === 58 ? 58 : Number(paperWidth) || 80;
  const plain = String(bodyHtml || "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const fakeOrder = {
    orderNumber: title || "REPORT",
    channel: "",
    items: [{ name: plain.slice(0, 400) || "Report", quantity: 1, price: 0, lineTotal: 0 }],
    subtotal: 0,
    total: 0,
    note: plain.slice(0, 800),
  };
  const bytes = buildEscPos("bill", fakeOrder, {
    paperWidth: width,
    businessName: businessName || title || "Amoons",
    boldText: cfg.boldText !== false,
    alignment: cfg.alignment || "center",
    fontSize: cfg.fontSize || "large",
    marginMm: cfg.marginMm,
    printDensity: cfg.printDensity,
    cutPaper: cfg.cutPaper !== false,
  });
  await printRawToNetwork({
    host,
    port: cfg.frontCashier?.networkPort || cfg.networkPort || 9100,
    bytes,
  });
  return true;
}

export async function printReceipt(order, options = {}) {
  if (!order) return false;
  applyReceiptProfile({ business: options.business, receipt: options.receipt });
  await printReceiptJob(order, options);
  return true;
}

export async function printKitchenTicket(order, options = {}) {
  if (!order) return false;
  await printKitchenTicketJob(order, options);
  return true;
}

export async function printKitchenAndBill(order, options = {}) {
  if (!order) return false;
  applyReceiptProfile({ business: options.business, receipt: options.receipt });
  await printKitchenAndBillJob(order, options);
  return true;
}

// silence unused import warning paths for delivery channels in markup helpers
void DELIVERY_CHANNELS;
