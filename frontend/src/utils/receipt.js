import QRCode from "qrcode";

import { BRAND, DELIVERY_CHANNELS } from "../data/orderConstants";
import { PRINT_VENDOR_LINE, srbVerificationUrl } from "./branding";
import { formatDateTime, formatMoney } from "./format";
import { getDisplayPreferences } from "./preferences";

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

const baseCss = (width) => `
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:#fff;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{
    width:${width}mm;max-width:${width}mm;padding:3.5mm 3mm;
    font-family:"Arial Narrow",Arial,"Helvetica Neue",Helvetica,sans-serif;
    font-size:${width < 70 ? 13 : 14}px;font-weight:700;line-height:1.25;
    color:#000;letter-spacing:0;
    -webkit-font-smoothing:none;font-smooth:never;text-rendering:geometricPrecision;
  }
  .copy{page-break-after:always}
  .copy:last-child{page-break-after:auto}
  header{text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:6px}
  header .logo{display:block;margin:0 auto 4px;max-width:${width < 70 ? 40 : 52}px;max-height:48px;image-rendering:crisp-edges}
  h1{font-size:${width < 70 ? 16 : 18}px;font-weight:900;letter-spacing:0.4px;text-transform:uppercase;color:#000;line-height:1.15}
  header p{font-size:${width < 70 ? 11 : 12}px;font-weight:700;color:#000;margin-top:2px}
  .pill{display:inline-block;margin-top:5px;border:2px solid #000;border-radius:0;padding:2px 7px;font-size:${width < 70 ? 12 : 13}px;font-weight:900;letter-spacing:0.3px}
  .meta{border-bottom:1px solid #000;padding:6px 0;font-size:${width < 70 ? 11 : 12}px;font-weight:700}
  .r{display:flex;justify-content:space-between;gap:6px;margin:1px 0}
  .r span:first-child{color:#000;text-transform:uppercase;font-size:${width < 70 ? 10 : 11}px;font-weight:700;letter-spacing:0.2px}
  .r span:last-child{text-align:right;font-weight:900;max-width:62%;color:#000}
  table{width:100%;border-collapse:collapse;margin:6px 0;table-layout:fixed}
  th{text-align:left;font-size:${width < 70 ? 10 : 11}px;font-weight:900;text-transform:uppercase;letter-spacing:0.2px;border-bottom:2px solid #000;padding:0 0 4px;color:#000}
  th.n,td.n{text-align:right}
  td{padding:4px 0;font-size:${width < 70 ? 12 : 13}px;font-weight:700;vertical-align:top;border-bottom:1px solid #000;color:#000;word-wrap:break-word}
  td em{display:block;font-style:normal;font-size:${width < 70 ? 10 : 11}px;font-weight:700;color:#000}
  .empty{text-align:center;color:#000;font-style:normal;font-weight:700;border:0}
  tfoot td{border:0;padding:3px 0;font-weight:700}
  tfoot .sub td{color:#000;font-size:${width < 70 ? 11 : 12}px;font-weight:700}
  tfoot .tot td{border-top:2px solid #000;font-size:${width < 70 ? 14 : 15}px;font-weight:900;padding-top:6px;color:#000}
  footer{text-align:center;margin-top:8px;border-top:2px solid #000;padding-top:6px}
  footer p{font-size:${width < 70 ? 11 : 12}px;font-weight:700;color:#000}
  footer .tiny{font-size:${width < 70 ? 10 : 11}px;font-weight:700;color:#000;margin-top:2px}
  footer .powered{margin-top:5px;font-size:${width < 70 ? 9 : 10}px;font-weight:700;color:#000;line-height:1.3;word-break:break-word}
  .srb-qr{margin:6px 0 3px;text-align:center}
  .srb-qr img{display:block;margin:0 auto;width:${width < 70 ? 26 : 30}mm;height:${width < 70 ? 26 : 30}mm;image-rendering:crisp-edges;-ms-interpolation-mode:nearest-neighbor}
  .srb-qr .tiny{margin-top:3px}
  .kot-qty{font-size:${width < 70 ? 15 : 16}px;font-weight:900;white-space:nowrap;padding-right:6px;color:#000}
  .kot-name{font-size:${width < 70 ? 14 : 15}px;font-weight:900;color:#000}
  @page{size:${width}mm auto;margin:0}
  @media print{
    html,body{background:#fff}
    body{width:${width}mm;-webkit-font-smoothing:none;font-smooth:never}
  }
`;

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
    return `<div class="srb-qr"><img src="${dataUrl}" alt="SRB verification QR code" width="220" height="220" /><p class="tiny">Scan to verify invoice</p></div>`;
  } catch (error) {
    console.error("SRB QR generation failed", error);
    return "";
  }
}

function poweredByFooter() {
  return `<p class="powered">${esc(PRINT_VENDOR_LINE)}</p>`;
}

function buildPrintDocument({ title, bodyHtml, css, copies = 1 }) {
  const count = Math.min(Math.max(Math.trunc(Number(copies)) || 1, 1), 5);
  const page =
    count === 1
      ? bodyHtml
      : Array.from({ length: count }, () => `<div class="copy">${bodyHtml}</div>`).join("");

  return {
    count,
    html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(
      title || "Print"
    )}</title><style>${css}</style></head><body>${page}</body></html>`,
  };
}

/**
 * Silent print via QZ Tray when available; otherwise optional browser fallback.
 * Prefer QZ so KOT/Bill never open Chrome's print preview dialog.
 */
export async function printHtml({
  title,
  bodyHtml,
  css,
  copies = 1,
  printerName = "",
  paperWidth = 80,
  allowBrowserFallback = false,
}) {
  if (typeof window === "undefined") return false;

  const { count, html } = buildPrintDocument({ title, bodyHtml, css, copies });

  try {
    const { printHtmlViaQz } = await import("./qzTray");
    await printHtmlViaQz({
      html,
      printerName,
      paperWidthMm: paperWidth,
      copies: count,
    });
    return true;
  } catch (qzError) {
    if (!allowBrowserFallback) {
      console.error("[print] QZ Tray silent print failed:", qzError?.message || qzError);
      throw new Error(
        qzError?.message ||
          "Direct printing requires QZ Tray. Install it on this PC, keep it running, then try again."
      );
    }
    console.warn(
      "[print] QZ unavailable, falling back to browser print:",
      qzError?.message || qzError
    );
  }

  if (typeof window.print !== "function") {
    return false;
  }

  return printHtmlBrowser({ title, html: html, copies: count });
}

/** Legacy iframe + window.print path (shows the browser print dialog). */
function printHtmlBrowser({ title, html }) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", title || "Print");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:80mm;height:120vh;border:0;z-index:-1;opacity:0.01;pointer-events:none;";

  document.body.appendChild(frame);

  const view = frame.contentWindow;
  if (!view) {
    frame.remove();
    return Promise.resolve(false);
  }

  const doc = view.document;
  doc.open();
  doc.write(html);
  doc.close();

  return new Promise((resolve) => {
    let settled = false;
    let opened = false;

    const cleanup = () => {
      window.clearTimeout(safetyTimer);
      try {
        window.removeEventListener("afterprint", onAfterPrint);
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        try {
          frame.remove();
        } catch {
          /* ignore */
        }
      }, 300);
    };

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Boolean(ok));
    };

    const reportOpened = () => {
      if (!opened) return;
      if (!settled) {
        settled = true;
        resolve(true);
      }
    };

    const onAfterPrint = () => {
      if (!settled) finish(opened);
      else cleanup();
    };

    const safetyTimer = window.setTimeout(() => {
      if (!settled) finish(opened);
      else cleanup();
    }, 60_000);

    view.addEventListener("afterprint", onAfterPrint, { once: true });
    view.onafterprint = onAfterPrint;
    window.addEventListener("afterprint", onAfterPrint, { once: true });

    const runPrint = () => {
      if (settled && opened) return;
      try {
        view.focus();
        opened = true;
        const started = Date.now();
        view.print();
        reportOpened();
        if (Date.now() - started > 300) onAfterPrint();
      } catch {
        finish(false);
      }
    };

    const images = Array.from(doc.images || []);
    const ready = images.length
      ? Promise.race([
          Promise.all(
            images.map(
              (img) =>
                img.complete ||
                new Promise((done) => {
                  img.onload = done;
                  img.onerror = done;
                })
            )
          ),
          new Promise((done) => window.setTimeout(done, 350)),
        ])
      : Promise.resolve();

    ready.then(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(runPrint);
      });
    });
  });
}

async function receiptMarkup(order) {
  const displayPreferences = getDisplayPreferences();
  const business = businessProfile || {};
  const receipt = receiptProfile || {};
  const showBusinessName = receipt.showBusinessName !== false;
  const showItemPrices = receipt.showItemPrices !== false;
  const showOrderDetails = displayPreferences.showOrderDetails;
  const showPaymentDetails = receipt.showPaymentDetails !== false;
  const businessName = showBusinessName ? business.name || BRAND.name : "";
  const srbQr = await srbQrBlock(order);
  const lines = (order.items || [])
    .map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const lineTotal =
        item.lineTotal != null ? Number(item.lineTotal) : price * qty;
      const detail = showItemPrices
        ? `${qty} × ${formatMoney(price)}`
        : `Quantity: ${qty}`;

      return `
        <tr>
          <td>${esc(item.name)}<em>${esc(detail)}</em></td>
          <td class="n">${esc(formatMoney(lineTotal))}</td>
        </tr>`;
    })
    .join("");

  const isDelivery = DELIVERY_CHANNELS.includes(order.channel);

  return `
    <header>
      ${
        business.logo
          ? `<img class="logo" src="${esc(business.logo)}" alt="" />`
          : ""
      }
      ${businessName ? `<h1>${esc(businessName)}</h1>` : ""}
      <p>${esc(business.tagline || BRAND.tagline)}</p>
      ${receipt.headerMessage ? `<p>${esc(receipt.headerMessage)}</p>` : ""}
      ${receipt.showTaxNumber && business.taxNumber ? `<p>${esc(business.taxNumber)}</p>` : ""}
      <p class="pill">${esc(order.orderNumber)}</p>
    </header>

    <div class="meta">
      ${row("Placed", formatDateTime(order.createdAt))}
      ${row("Channel", order.channel)}
      ${row("Status", order.status)}
    </div>

    <table>
      <thead><tr><th>Item</th><th class="n">Amount</th></tr></thead>
      <tbody>${
        lines || `<tr><td colspan="2" class="empty">No items</td></tr>`
      }</tbody>
      <tfoot>
        <tr class="sub"><td>Subtotal</td><td class="n">${esc(
          formatMoney(order.subtotal)
        )}</td></tr>
        ${
          order.discountAmount && Number(order.discountAmount) > 0
            ? `<tr class="sub"><td>Discount (${esc(
                order.discountType === "percentage"
                  ? `${order.discountPercent || order.discountPercentage || ""}%`
                  : order.discountType || "fixed"
              )})</td><td class="n">-${esc(formatMoney(order.discountAmount))}</td></tr>`
            : ""
        }
        ${
          Number(order.taxTotal ?? order.taxAmount) > 0
            ? `<tr class="sub"><td>GST${
                order.taxRate ? ` (${esc(order.taxRate)}%)` : ""
              }</td><td class="n">${esc(
                formatMoney(order.taxTotal ?? order.taxAmount)
              )}</td></tr>`
            : ""
        }
        <tr class="tot"><td>Total</td><td class="n">${esc(
          formatMoney(order.total)
        )}</td></tr>
      </tfoot>
    </table>

    ${
      showPaymentDetails
        ? `<div class="meta">
      ${row("Payment", order.paymentMethod)}
      ${row("Paid", formatMoney(order.amountPaid))}
      ${row("Status", order.paymentStatus)}
      ${order.balanceDue > 0 ? row("Balance due", formatMoney(order.balanceDue)) : ""}
    </div>`
        : ""
    }

    ${
      showOrderDetails
        ? `<div class="meta">
      ${row("Customer", order.customerName)}
      ${row("Phone Number", order.customerPhone)}
      ${isDelivery ? row("Rider", order.riderName) : ""}
      ${isDelivery ? row("Phone", order.riderPhone) : ""}
      ${isDelivery ? row("Deliver to", order.deliveryAddress) : ""}
      ${row("Note", order.note)}
      ${order.srbInvoiceId ? row("SRB Invoice", order.srbInvoiceId) : ""}
    </div>`
        : ""
    }

    <footer>
      <p>${esc(receipt.footerMessage || "Thank you for your order.")}</p>
      ${srbQr}
      <p class="tiny">${esc(new Date().toLocaleString("en-GB"))}</p>
      ${poweredByFooter()}
    </footer>
  `;
}

/** Kitchen screen: no prices, larger bold type, one line per item. */
function kitchenMarkup(order) {
  const lines = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td class="kot-qty">${esc(item.quantity)} ×</td>
          <td class="kot-name">${esc(item.name)}${
            item.category ? `<em>${esc(item.category)}</em>` : ""
          }</td>
        </tr>`
    )
    .join("");

  return `
    <header>
      <h1>Kitchen ticket</h1>
      <p class="pill">${esc(order.orderNumber)}</p>
      <p>${esc(order.channel)}${order.customerPhone || order.customerName ? ` · ${esc(order.customerPhone || order.customerName)}` : ""}</p>
    </header>

    <div class="meta">
      ${row("Fired", formatDateTime(order.createdAt || new Date().toISOString()))}
    </div>

    <table>
      <tbody>${lines || '<tr><td colspan="2" class="empty">No items</td></tr>'}</tbody>
    </table>

    ${order.note ? `<div class="meta"><strong>Note:</strong> ${esc(order.note)}</div>` : ""}

    <footer>
      <p class="tiny">${esc(new Date().toLocaleString("en-GB"))}</p>
      ${poweredByFooter()}
    </footer>
  `;
}

export async function printReceipt(
  order,
  {
    paperWidth = 80,
    copies = 1,
    business,
    receipt,
    printerName = "",
    allowBrowserFallback = false,
  } = {}
) {
  if (!order) return false;
  applyReceiptProfile({ business, receipt });

  return printHtml({
    title: order.orderNumber || "Receipt",
    bodyHtml: await receiptMarkup(order),
    css: baseCss(paperWidth),
    copies,
    paperWidth,
    printerName,
    allowBrowserFallback,
  });
}

export async function printKitchenTicket(
  order,
  {
    paperWidth = 80,
    copies = 1,
    printerName = "",
    allowBrowserFallback = false,
  } = {}
) {
  if (!order) return false;

  return printHtml({
    title: `KOT ${order.orderNumber || ""}`.trim(),
    bodyHtml: kitchenMarkup(order),
    css: baseCss(paperWidth),
    copies,
    paperWidth,
    printerName,
    allowBrowserFallback,
  });
}

/**
 * Kitchen ticket then customer bill in one silent QZ job (or one browser job).
 */
export async function printKitchenAndBill(
  order,
  {
    paperWidth = 80,
    copies = 1,
    business,
    receipt,
    printerName = "",
    allowBrowserFallback = false,
  } = {}
) {
  if (!order) return false;
  applyReceiptProfile({ business, receipt });
  const bill = await receiptMarkup(order);

  return printHtml({
    title: `KOT & bill ${order.orderNumber || ""}`.trim(),
    bodyHtml: `<section class="copy">${kitchenMarkup(
      order
    )}</section><section class="copy">${bill}</section>`,
    css: baseCss(paperWidth),
    copies,
    paperWidth,
    printerName,
    allowBrowserFallback,
  });
}
