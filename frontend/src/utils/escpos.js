/**
 * ESC/POS encoder for 58/80mm (and custom) thermal printers.
 * Honours printer style settings for Bill and KOT.
 */

const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

function textBytes(value) {
  const raw = String(value ?? "");
  if (encoder) return encoder.encode(raw);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i) & 0xff;
  return out;
}

function concat(chunks) {
  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function cmd(...bytes) {
  return new Uint8Array(bytes);
}

function line(text = "") {
  return textBytes(`${text}\n`);
}

function money(value) {
  return (Number(value) || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function wrap(text, width) {
  const words = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!word) continue;
    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) current = next;
    else {
      if (current) lines.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function center(text, width) {
  const value = String(text || "");
  if (value.length >= width) return value.slice(0, width);
  const pad = Math.floor((width - value.length) / 2);
  return `${" ".repeat(pad)}${value}`;
}

function alignPad(text, width, alignment) {
  const value = String(text || "");
  if (value.length >= width) return value.slice(0, width);
  const align = String(alignment || "center").toLowerCase();
  if (align === "left") return value;
  if (align === "right") return `${" ".repeat(width - value.length)}${value}`;
  return center(value, width);
}

function charsForWidth(paperWidthMm) {
  const mm = Number(paperWidthMm) || 80;
  if (mm <= 58) return 32;
  if (mm >= 100) return Math.min(64, Math.max(42, Math.round(mm * 0.52)));
  return 42;
}

function fontScale(fontSize) {
  const value = String(fontSize || "large").toLowerCase();
  if (value === "xlarge") return 0x11;
  if (value === "small" || value === "normal") return 0x00;
  return 0x01; // large — double height
}

function densityCmd(density) {
  const value = String(density || "normal").toLowerCase();
  if (value === "dark") return cmd(0x1b, 0x37, 7, 80, 6);
  if (value === "light") return cmd(0x1b, 0x37, 7, 40, 2);
  return cmd(0x1b, 0x37, 7, 60, 4);
}

function resolveStyle(options = {}) {
  const paperWidth =
    Number(options.paperWidth) > 0 ? Number(options.paperWidth) : 80;
  return {
    paperWidth,
    width: charsForWidth(paperWidth),
    fontSize: options.fontSize || "large",
    boldText: options.boldText !== false,
    alignment: options.alignment || "center",
    marginMm: Math.max(0, Math.min(10, Number(options.marginMm) || 2)),
    lineSpacing: Number(options.lineSpacing) || 1.35,
    printDensity: options.printDensity || "normal",
    cutPaper: options.cutPaper !== false,
    businessName: options.businessName || "Amoons",
  };
}

function feedLines(mm) {
  const lines = Math.max(1, Math.round((Number(mm) || 2) / 2));
  return Array.from({ length: lines }, () => cmd(0x0a));
}

function rule(width) {
  return "-".repeat(Math.min(width, width < 36 ? 24 : 32));
}

/**
 * @param {"bill"|"kot"} kind
 * @param {object} order
 * @param {object} options
 */
export function buildEscPos(kind, order, options = {}) {
  const style = resolveStyle(options);
  const { width } = style;
  const isKot = kind === "kot";
  const chunks = [];
  const pad = (text) => alignPad(text, width, style.alignment);
  const scale = fontScale(style.fontSize);

  chunks.push(cmd(0x1b, 0x40));
  chunks.push(densityCmd(style.printDensity));
  chunks.push(...feedLines(style.marginMm));
  chunks.push(cmd(0x1b, 0x61, style.alignment === "left" ? 0 : style.alignment === "right" ? 2 : 1));
  if (style.boldText) chunks.push(cmd(0x1b, 0x45, 0x01));

  chunks.push(cmd(0x1d, 0x21, 0x11));
  chunks.push(line(isKot ? "KITCHEN TICKET" : style.businessName));
  chunks.push(cmd(0x1d, 0x21, scale));
  chunks.push(line(String(order?.orderNumber || "ORDER")));
  chunks.push(cmd(0x1d, 0x21, 0x00));
  chunks.push(line(pad(rule(width))));

  const meta = [];
  if (order?.channel) meta.push(String(order.channel));
  if (!isKot && order?.paymentMethod) meta.push(String(order.paymentMethod));
  if (!isKot && order?.status) meta.push(String(order.status));
  if (isKot && (order?.customerPhone || order?.customerName)) {
    meta.push(String(order.customerPhone || order.customerName));
  }
  if (order?.cashierLabel) meta.push(String(order.cashierLabel));
  meta.forEach((bit) => {
    wrap(bit, width).forEach((row) => chunks.push(line(pad(row))));
  });
  chunks.push(line(pad(rule(width))));

  for (const item of order?.items || []) {
    const qty = Number(item.quantity) || 0;
    const name = String(item.name || "Item");
    if (isKot) {
      chunks.push(cmd(0x1b, 0x45, 0x01));
      chunks.push(cmd(0x1d, 0x21, style.fontSize === "normal" ? 0x01 : 0x11));
      wrap(`${qty} x ${name}`, width).forEach((row) => chunks.push(line(pad(row))));
      chunks.push(cmd(0x1d, 0x21, 0x00));
      if (item.category) {
        wrap(String(item.category), width).forEach((row) => chunks.push(line(pad(row))));
      }
      chunks.push(cmd(0x0a));
      continue;
    }
    if (style.boldText) chunks.push(cmd(0x1b, 0x45, 0x01));
    wrap(`${qty} x ${name}`, width).forEach((row) => chunks.push(line(pad(row))));
    const price = Number(item.lineTotal ?? Number(item.price) * qty) || 0;
    chunks.push(line(pad(money(price))));
    chunks.push(cmd(0x0a));
  }

  chunks.push(line(pad(rule(width))));

  if (!isKot) {
    if (style.boldText) chunks.push(cmd(0x1b, 0x45, 0x01));
    chunks.push(line(pad(`Subtotal  ${money(order?.subtotal)}`)));
    if (Number(order?.discountAmount) > 0) {
      chunks.push(line(pad(`Discount  -${money(order.discountAmount)}`)));
    }
    if (Number(order?.taxTotal ?? order?.taxAmount) > 0) {
      const label = order?.taxRate ? `Tax ${order.taxRate}%` : "Tax";
      chunks.push(
        line(pad(`${label}  ${money(order.taxTotal ?? order.taxAmount)}`))
      );
    }
    chunks.push(cmd(0x1d, 0x21, 0x11));
    chunks.push(cmd(0x1b, 0x45, 0x01));
    chunks.push(line(pad(`TOTAL  ${money(order?.total)}`)));
    chunks.push(cmd(0x1d, 0x21, 0x00));
  }

  if (order?.note) {
    chunks.push(line(pad(rule(width))));
    wrap(`Note: ${order.note}`, width).forEach((row) => chunks.push(line(pad(row))));
  }

  if (order?.srbInvoiceId && !isKot) {
    chunks.push(line(pad(rule(width))));
    chunks.push(line(pad(`SRB ${order.srbInvoiceId}`)));
  }

  chunks.push(cmd(0x1b, 0x61, 0x01));
  if (style.boldText) chunks.push(cmd(0x1b, 0x45, 0x01));
  chunks.push(line(new Date().toLocaleString("en-GB")));
  if (!isKot) chunks.push(line("Thank you"));
  chunks.push(...feedLines(style.marginMm));
  chunks.push(cmd(0x0a), cmd(0x0a));
  if (style.cutPaper) chunks.push(cmd(0x1d, 0x56, 0x00));
  return concat(chunks);
}

export function buildEscPosTest(paperWidth = 80, style = {}) {
  return buildEscPos(
    "bill",
    {
      orderNumber: "TEST-PRINT",
      channel: "Dine-In",
      paymentMethod: "Cash",
      status: "Completed",
      items: [{ name: "Test item", quantity: 1, price: 100, lineTotal: 100 }],
      subtotal: 100,
      taxAmount: 15,
      taxRate: 15,
      total: 115,
      note: "Direct print agent test",
    },
    { paperWidth, businessName: "Printer Test", ...style }
  );
}
