const nodemailer = require("nodemailer");
const db = require("../config/db");

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

function notificationEnabled() {
  return (
    String(process.env.GMAIL_NOTIFICATIONS_ENABLED || "true").toLowerCase() !==
      "false" &&
    Boolean(process.env.GMAIL_USER && process.env.GMAIL_PASS)
  );
}

function recipient() {
  return (
    process.env.GMAIL_NOTIFY_TO ||
    process.env.GMAIL_USER ||
    "amoonscafe@gmail.com"
  );
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
  });

  return transporter;
}

async function sendMail({ subject, text, html }) {
  if (!notificationEnabled()) {
    console.warn(
      "[email] Skipped notification — set GMAIL_USER and GMAIL_PASS to enable."
    );
    return { skipped: true };
  }

  const fromName = process.env.GMAIL_FROM_NAME || "Amoons Cafe POS";
  const info = await getTransporter().sendMail({
    from: `"${fromName}" <${process.env.GMAIL_USER}>`,
    to: recipient(),
    subject,
    text,
    html,
  });

  return { skipped: false, messageId: info.messageId };
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
            o.total,
            COALESCE(o.note, '') AS note,
            o.created_at AS "createdAt",
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
 * Fire-and-forget New Sale email. Never throws to callers.
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
    const subject = `New Sale · ${order.orderNumber || "Order"} · ${money(
      order.total
    )}`;

    const text = [
      "New Sale Notification — Amoons Cafe POS",
      "",
      `Order: ${order.orderNumber || ""}`,
      `Status: ${order.status || ""}`,
      `Channel: ${order.channel || ""}`,
      `Payment: ${order.paymentMethod || ""} (${order.paymentStatus || ""})`,
      `Customer: ${order.customerName || "—"}`,
      `Phone: ${order.customerPhone || "—"}`,
      `Placed: ${order.createdAt || new Date().toISOString()}`,
      "",
      "Items:",
      items.text,
      "",
      `Subtotal: ${money(order.subtotal)}`,
      Number(order.discountAmount) > 0
        ? `Discount: -${money(order.discountAmount)}`
        : null,
      Number(order.taxAmount ?? order.taxTotal) > 0
        ? `Tax: ${money(order.taxAmount ?? order.taxTotal)}`
        : null,
      `Total: ${money(order.total)}`,
      `Amount paid: ${money(order.amountPaid)}`,
      order.note ? `Note: ${order.note}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1f1218;line-height:1.45">
        <h2 style="color:#4a001d;margin:0 0 8px">New Sale</h2>
        <p style="margin:0 0 12px">Amoons Cafe POS sale notification</p>
        <table style="border-collapse:collapse;width:100%;max-width:640px;margin-bottom:14px">
          <tr><td><b>Order</b></td><td>${esc(order.orderNumber)}</td></tr>
          <tr><td><b>Status</b></td><td>${esc(order.status)}</td></tr>
          <tr><td><b>Channel</b></td><td>${esc(order.channel)}</td></tr>
          <tr><td><b>Payment</b></td><td>${esc(order.paymentMethod)} (${esc(
      order.paymentStatus
    )})</td></tr>
          <tr><td><b>Customer</b></td><td>${esc(
            order.customerName || "—"
          )}</td></tr>
          <tr><td><b>Phone</b></td><td>${esc(
            order.customerPhone || "—"
          )}</td></tr>
          <tr><td><b>Placed</b></td><td>${esc(
            order.createdAt || new Date().toISOString()
          )}</td></tr>
        </table>
        <table style="border-collapse:collapse;width:100%;max-width:640px" border="1" cellpadding="8">
          <thead style="background:#f7eef2">
            <tr>
              <th align="left">Item</th>
              <th>Qty</th>
              <th align="right">Price</th>
              <th align="right">Line</th>
            </tr>
          </thead>
          <tbody>${items.html}</tbody>
        </table>
        <p style="margin-top:14px">
          <b>Subtotal:</b> ${esc(money(order.subtotal))}<br/>
          ${
            Number(order.discountAmount) > 0
              ? `<b>Discount:</b> -${esc(money(order.discountAmount))}<br/>`
              : ""
          }
          ${
            Number(order.taxAmount ?? order.taxTotal) > 0
              ? `<b>Tax:</b> ${esc(money(order.taxAmount ?? order.taxTotal))}<br/>`
              : ""
          }
          <b>Total:</b> ${esc(money(order.total))}<br/>
          <b>Amount paid:</b> ${esc(money(order.amountPaid))}
        </p>
        ${
          order.note
            ? `<p><b>Note:</b> ${esc(order.note)}</p>`
            : ""
        }
      </div>
    `;

    return await sendMail({ subject, text, html });
  } catch (error) {
    console.error("[email] New sale notification failed:", error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Fire-and-forget Shift Closed email. Never throws to callers.
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
      `Opened: ${shift.openedAt || report.openedAt || ""}`,
      `Closed: ${shift.closedAt || report.closedAt || ""}`,
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
            shift.openedAt || report.openedAt || ""
          )}</td></tr>
          <tr><td><b>Closed</b></td><td>${esc(
            shift.closedAt || report.closedAt || ""
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

/** Non-blocking wrappers used by controllers. */
function queueNewSale(order) {
  void notifyNewSale(order);
}

function queueShiftClosed(shift, closingReport) {
  void notifyShiftClosed(shift, closingReport);
}

module.exports = {
  notifyNewSale,
  notifyShiftClosed,
  queueNewSale,
  queueShiftClosed,
  sendMail,
  notificationEnabled,
};
