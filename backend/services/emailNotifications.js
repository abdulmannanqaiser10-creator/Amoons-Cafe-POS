const nodemailer = require("nodemailer");
const db = require("../config/db");

const SMTP_TIMEOUT_MS = 18000;
const SEND_BUDGET_MS = 20000;

function money(value) {
  const n = Number(value);
  return `Rs ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gmailPass() {
  // App Passwords are often copied with spaces; strip them.
  return String(process.env.GMAIL_PASS || "").replace(/\s+/g, "");
}

function notificationEnabled() {
  return (
    String(process.env.GMAIL_NOTIFICATIONS_ENABLED || "true").toLowerCase() !==
      "false" &&
    Boolean(process.env.GMAIL_USER && gmailPass())
  );
}

function httpFallbackEnabled() {
  return (
    String(process.env.GMAIL_HTTP_FALLBACK || "true").toLowerCase() !== "false"
  );
}

function recipient() {
  return (
    process.env.GMAIL_NOTIFY_TO ||
    process.env.GMAIL_USER ||
    "amoonscafe@gmail.com"
  );
}

function formatDateTime(value) {
  if (!value) return new Date().toLocaleString("en-PK", { hour12: true });
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-PK", {
    timeZone: process.env.GMAIL_TIMEZONE || "Asia/Karachi",
    hour12: true,
  });
}

let transporter = null;

function resetTransporter() {
  transporter = null;
}

function getTransporter() {
  if (transporter) return transporter;

  const pass = gmailPass();
  transporter = nodemailer.createTransport({
    host: process.env.GMAIL_SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.GMAIL_SMTP_PORT || 465),
    secure: String(process.env.GMAIL_SMTP_SECURE || "true").toLowerCase() !== "false",
    auth: {
      user: process.env.GMAIL_USER,
      pass,
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  return transporter;
}

async function sendViaSmtp({ subject, text, html }) {
  const fromName = process.env.GMAIL_FROM_NAME || "Amoons Cafe POS";
  const info = await getTransporter().sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to: recipient(),
    subject,
    text,
    html,
  });
  return { skipped: false, via: "smtp", messageId: info.messageId };
}

function publicOrigin() {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "amoonssoft.vercel.app";
  const normalized = String(host).replace(/^https?:\/\//, "");
  return `https://${normalized}`;
}

/**
 * HTTP delivery fallback (FormSubmit) so notifications still reach the
 * configured Gmail inbox when Google rejects the account login password.
 * First delivery may require clicking FormSubmit's one-time confirmation link.
 */
async function sendViaHttpFallback({ subject, text, html }) {
  const to = recipient();
  const origin = publicOrigin();
  const url = `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SMTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: origin,
        Referer: `${origin}/`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        _subject: subject,
        _template: "box",
        _captcha: "false",
        name: process.env.GMAIL_FROM_NAME || "Amoons Cafe POS",
        email: process.env.GMAIL_USER || to,
        message: text,
        html,
      }),
    });

    const body = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      throw new Error(
        `HTTP fallback failed (${response.status}): ${body.slice(0, 240)}`
      );
    }

    const message = String(parsed?.message || body || "");
    const successFlag = parsed?.success;
    const ok =
      successFlag === true ||
      successFlag === "true" ||
      /thank you|submitted|sent/i.test(message);

    if (/needs Activation|Activate Form/i.test(message)) {
      console.warn(
        "[email] FormSubmit activation required — check inbox for Activate Form link:",
        to
      );
      return {
        skipped: false,
        via: "http-fallback",
        pendingActivation: true,
        response: message.slice(0, 240),
      };
    }

    if (!ok && successFlag === "false") {
      throw new Error(message.slice(0, 240) || "HTTP fallback rejected");
    }

    return {
      skipped: false,
      via: "http-fallback",
      response: message.slice(0, 240),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sendMail({ subject, text, html }) {
  if (
    String(process.env.GMAIL_NOTIFICATIONS_ENABLED || "true").toLowerCase() ===
    "false"
  ) {
    console.warn("[email] Skipped — GMAIL_NOTIFICATIONS_ENABLED=false");
    return { skipped: true };
  }

  const to = recipient();
  if (!to) {
    console.warn("[email] Skipped — no recipient configured");
    return { skipped: true };
  }

  let smtpError = null;

  if (notificationEnabled()) {
    try {
      const result = await sendViaSmtp({ subject, text, html });
      console.log(`[email] Sent via SMTP → ${to}: ${subject}`);
      return result;
    } catch (error) {
      smtpError = error;
      resetTransporter();
      console.error("[email] SMTP send failed:", error.message);
    }
  } else {
    console.warn(
      "[email] Gmail SMTP not configured (need GMAIL_USER + App Password in GMAIL_PASS)."
    );
  }

  if (httpFallbackEnabled()) {
    try {
      const result = await sendViaHttpFallback({ subject, text, html });
      console.log(`[email] Sent via HTTP fallback → ${to}: ${subject}`);
      if (smtpError) {
        result.smtpError = smtpError.message;
      }
      return result;
    } catch (fallbackError) {
      console.error("[email] HTTP fallback failed:", fallbackError.message);
      return {
        ok: false,
        error: fallbackError.message,
        smtpError: smtpError ? smtpError.message : undefined,
      };
    }
  }

  return {
    ok: false,
    error: smtpError ? smtpError.message : "Email not configured",
  };
}

function saleItemsRows(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  if (!items.length) {
    return {
      text: "No line items.",
      html: "<tr><td colspan='4'>No line items.</td></tr>",
    };
  }

  const text = items
    .map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const line =
        item.lineTotal != null ? Number(item.lineTotal) : price * qty;
      return `- ${item.name} | Qty ${qty} | ${money(price)} | ${money(line)}`;
    })
    .join("\n");

  const html = items
    .map((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const line =
        item.lineTotal != null ? Number(item.lineTotal) : price * qty;
      return `<tr>
        <td>${esc(item.name)}</td>
        <td style="text-align:center">${esc(qty)}</td>
        <td style="text-align:right">${esc(money(price))}</td>
        <td style="text-align:right">${esc(money(line))}</td>
      </tr>`;
    })
    .join("");

  return { text, html };
}

async function loadOrderById(orderId) {
  const result = await db.query(
    `SELECT o.id,
            o.order_number AS "orderNumber",
            COALESCE(o.customer_name, '') AS "customerName",
            COALESCE(o.customer_phone, '') AS "customerPhone",
            o.channel,
            o.status,
            o.payment_method AS "paymentMethod",
            o.payment_status AS "paymentStatus",
            o.amount_paid AS "amountPaid",
            o.subtotal,
            o.discount_amount AS "discountAmount",
            o.tax_amount AS "taxAmount",
            o.tax_rate AS "taxRate",
            o.total,
            COALESCE(o.note, '') AS note,
            o.created_at AS "createdAt",
            o.updated_at AS "updatedAt",
            COALESCE((
              SELECT json_agg(json_build_object(
                'name', oi.product_name,
                'quantity', oi.quantity,
                'price', oi.unit_price,
                'lineTotal', oi.line_total
              ) ORDER BY oi.id)
              FROM order_items oi WHERE oi.order_id = o.id
            ), '[]'::json) AS items
       FROM orders o
      WHERE o.id = $1`,
    [orderId]
  );
  return result.rows[0] || null;
}

/**
 * New Sale email with full invoice details. Never throws to callers.
 */
async function notifyNewSale(orderOrId) {
  try {
    let order = orderOrId;
    if (orderOrId == null) return { skipped: true };
    if (typeof orderOrId === "number" || typeof orderOrId === "string") {
      order = await loadOrderById(orderOrId);
    } else if (orderOrId?.id && (!orderOrId.items || !orderOrId.items.length)) {
      order = (await loadOrderById(orderOrId.id)) || orderOrId;
    }
    if (!order) return { skipped: true };

    const items = saleItemsRows(order);
    const invoice = order.orderNumber || "Order";
    const placedAt = formatDateTime(order.createdAt || order.updatedAt);
    const discount = Number(order.discountAmount) || 0;
    const tax = Number(order.taxAmount ?? order.taxTotal) || 0;
    const subtotal = Number(order.subtotal) || 0;
    const total = Number(order.total) || 0;
    const taxRate =
      order.taxRate != null && Number(order.taxRate) > 0
        ? ` (${Number(order.taxRate)}%)`
        : "";

    const subject = `New Sale · ${invoice} · ${money(total)}`;

    const text = [
      "New Sale Notification — Amoons Cafe POS",
      "",
      `Invoice: ${invoice}`,
      `Date / Time: ${placedAt}`,
      `Status: ${order.status || ""}`,
      `Channel: ${order.channel || ""}`,
      `Payment method: ${order.paymentMethod || ""}`,
      `Payment status: ${order.paymentStatus || ""}`,
      `Customer: ${order.customerName || "—"}`,
      `Phone: ${order.customerPhone || "—"}`,
      "",
      "Items:",
      items.text,
      "",
      `Subtotal: ${money(subtotal)}`,
      `Discount: ${discount > 0 ? `-${money(discount)}` : money(0)}`,
      `Tax${taxRate}: ${money(tax)}`,
      `Grand Total: ${money(total)}`,
      `Amount paid: ${money(order.amountPaid)}`,
      order.note ? `Note: ${order.note}` : null,
    ]
      .filter((line) => line !== null)
      .join("\n");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1f1218;line-height:1.45">
        <h2 style="color:#4a001d;margin:0 0 8px">New Sale</h2>
        <p style="margin:0 0 12px">Amoons Cafe POS sale notification</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px;margin-bottom:14px">
          <tr><td><b>Invoice</b></td><td>${esc(invoice)}</td></tr>
          <tr><td><b>Date / Time</b></td><td>${esc(placedAt)}</td></tr>
          <tr><td><b>Status</b></td><td>${esc(order.status)}</td></tr>
          <tr><td><b>Channel</b></td><td>${esc(order.channel)}</td></tr>
          <tr><td><b>Payment method</b></td><td>${esc(order.paymentMethod)}</td></tr>
          <tr><td><b>Payment status</b></td><td>${esc(order.paymentStatus)}</td></tr>
          <tr><td><b>Customer</b></td><td>${esc(order.customerName || "—")}</td></tr>
          <tr><td><b>Phone</b></td><td>${esc(order.customerPhone || "—")}</td></tr>
        </table>
        <table style="border-collapse:collapse;width:100%;max-width:640px" border="1" cellpadding="8">
          <thead style="background:#f7eef2">
            <tr>
              <th align="left">Item</th>
              <th>Qty</th>
              <th align="right">Unit Price</th>
              <th align="right">Line Total</th>
            </tr>
          </thead>
          <tbody>${items.html}</tbody>
        </table>
        <p style="margin-top:14px">
          <b>Subtotal:</b> ${esc(money(subtotal))}<br/>
          <b>Discount:</b> ${esc(discount > 0 ? `-${money(discount)}` : money(0))}<br/>
          <b>Tax${esc(taxRate)}:</b> ${esc(money(tax))}<br/>
          <b>Grand Total:</b> ${esc(money(total))}<br/>
          <b>Amount paid:</b> ${esc(money(order.amountPaid))}
        </p>
        ${order.note ? `<p><b>Note:</b> ${esc(order.note)}</p>` : ""}
      </div>
    `;

    return await sendMail({ subject, text, html });
  } catch (error) {
    console.error("[email] New sale notification failed:", error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Shift Closed email. Never throws to callers.
 */
async function notifyShiftClosed(shift, closingReport = null) {
  try {
    if (!shift) return { skipped: true };

    const report = closingReport || shift.closingReport || {};
    const totals = report.totals || shift.totals || {};
    const subject = `Shift Closed · ${shift.shiftNumber || "Shift"} · Net ${money(
      totals.netRevenue ??
        Number(totals.totalSales || 0) -
          Number(totals.reversedValue || totals.refunds || 0) -
          Number(totals.pullTotal || totals.expenses || 0)
    )}`;

    const text = [
      "Shift Closing Notification — Amoons Cafe POS",
      "",
      `Shift: ${shift.shiftNumber || ""}`,
      `Cashier: ${shift.employeeName || ""}`,
      `Branch: ${shift.branchName || ""}`,
      `Opened: ${formatDateTime(shift.openedAt || report.openedAt)}`,
      `Closed: ${formatDateTime(shift.closedAt || report.closedAt)}`,
      "",
      `Opening cash: ${money(shift.openingCash ?? report.openingCash)}`,
      `Expected cash: ${money(shift.expectedCash ?? report.expectedCash)}`,
      `Closing cash: ${money(shift.closingCash ?? report.closingCash)}`,
      `Difference: ${money(shift.difference ?? report.difference)}`,
      "",
      `Total sales: ${money(totals.totalSales)}`,
      `Cash sales: ${money(totals.cashSales)}`,
      `Card sales: ${money(totals.cardSales)}`,
      `Online sales: ${money(
        Number(totals.onlineSales || 0) + Number(totals.aggregatorSales || 0)
      )}`,
      `Refunds: ${money(totals.reversedValue ?? totals.refunds)}`,
      `Expenses / pulls: ${money(totals.pullTotal ?? totals.expenses)}`,
      `Net revenue: ${money(totals.netRevenue)}`,
      `Orders: ${totals.orderCount ?? 0} (completed ${
        totals.completedOrders ?? 0
      })`,
      notesLine(shift.notes || report.notes),
    ]
      .filter((line) => line !== null)
      .join("\n");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1f1218;line-height:1.45">
        <h2 style="color:#4a001d;margin:0 0 8px">Shift Closed</h2>
        <p style="margin:0 0 12px">Amoons Cafe POS shift summary</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px" cellpadding="6">
          <tr><td><b>Shift</b></td><td>${esc(shift.shiftNumber)}</td></tr>
          <tr><td><b>Cashier</b></td><td>${esc(shift.employeeName)}</td></tr>
          <tr><td><b>Branch</b></td><td>${esc(shift.branchName || "—")}</td></tr>
          <tr><td><b>Opened</b></td><td>${esc(
            formatDateTime(shift.openedAt || report.openedAt)
          )}</td></tr>
          <tr><td><b>Closed</b></td><td>${esc(
            formatDateTime(shift.closedAt || report.closedAt)
          )}</td></tr>
          <tr><td><b>Opening cash</b></td><td>${esc(
            money(shift.openingCash ?? report.openingCash)
          )}</td></tr>
          <tr><td><b>Expected cash</b></td><td>${esc(
            money(shift.expectedCash ?? report.expectedCash)
          )}</td></tr>
          <tr><td><b>Closing cash</b></td><td>${esc(
            money(shift.closingCash ?? report.closingCash)
          )}</td></tr>
          <tr><td><b>Difference</b></td><td>${esc(
            money(shift.difference ?? report.difference)
          )}</td></tr>
          <tr><td><b>Total sales</b></td><td>${esc(
            money(totals.totalSales)
          )}</td></tr>
          <tr><td><b>Cash / Card / Online</b></td><td>${esc(
            `${money(totals.cashSales)} / ${money(totals.cardSales)} / ${money(
              Number(totals.onlineSales || 0) +
                Number(totals.aggregatorSales || 0)
            )}`
          )}</td></tr>
          <tr><td><b>Refunds</b></td><td>${esc(
            money(totals.reversedValue ?? totals.refunds)
          )}</td></tr>
          <tr><td><b>Expenses</b></td><td>${esc(
            money(totals.pullTotal ?? totals.expenses)
          )}</td></tr>
          <tr><td><b>Net revenue</b></td><td>${esc(
            money(totals.netRevenue)
          )}</td></tr>
          <tr><td><b>Orders</b></td><td>${esc(
            `${totals.orderCount ?? 0} (completed ${
              totals.completedOrders ?? 0
            })`
          )}</td></tr>
        </table>
        ${
          shift.notes || report.notes
            ? `<p><b>Notes:</b> ${esc(shift.notes || report.notes)}</p>`
            : ""
        }
      </div>
    `;

    return await sendMail({ subject, text, html });
  } catch (error) {
    console.error("[email] Shift close notification failed:", error.message);
    return { ok: false, error: error.message };
  }
}

function notesLine(notes) {
  const value = String(notes || "").trim();
  return value ? `Notes: ${value}` : null;
}

/**
 * Await sale email within a budget so Vercel/serverless does not freeze
 * the request before SMTP/HTTP delivery finishes.
 */
async function awaitNewSale(order, budgetMs = SEND_BUDGET_MS) {
  try {
    return await Promise.race([
      notifyNewSale(order),
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ skipped: true, timedOut: true }),
          budgetMs
        )
      ),
    ]);
  } catch (error) {
    console.error("[email] awaitNewSale failed:", error.message);
    return { ok: false, error: error.message };
  }
}

async function awaitShiftClosed(shift, closingReport, budgetMs = SEND_BUDGET_MS) {
  try {
    return await Promise.race([
      notifyShiftClosed(shift, closingReport),
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ skipped: true, timedOut: true }),
          budgetMs
        )
      ),
    ]);
  } catch (error) {
    console.error("[email] awaitShiftClosed failed:", error.message);
    return { ok: false, error: error.message };
  }
}

/** Non-blocking wrappers (prefer awaitNewSale / awaitShiftClosed on Vercel). */
function queueNewSale(order) {
  void notifyNewSale(order);
}

function queueShiftClosed(shift, closingReport) {
  void notifyShiftClosed(shift, closingReport);
}

module.exports = {
  notifyNewSale,
  notifyShiftClosed,
  awaitNewSale,
  awaitShiftClosed,
  queueNewSale,
  queueShiftClosed,
  sendMail,
  notificationEnabled,
  resetTransporter,
};
