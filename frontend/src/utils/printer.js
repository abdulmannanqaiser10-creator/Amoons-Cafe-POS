import { settingsApi } from "../api/client";
import { buildEscPos } from "./escpos";
import { printRawToNetwork, probeNetworkPrinter } from "./printTransport";

export const CASHIER_DEFAULT = {
  enabled: true,
  connection: "Network",
  networkHost: "",
  networkPort: 9100,
  printerName: "",
  categories: [],
};

export const PRINTER_DEFAULTS = {
  printerName: "Network Thermal Printer",
  printerType: "Both",
  connection: "Network",
  paperWidth: 80,
  customPaperWidthMm: 80,
  autoDetectPaperWidth: false,
  copies: 1,
  autoPrintReceipt: true,
  autoPrintKitchen: true,
  voiceAlert: false,
  networkHost: "",
  networkPort: 9100,
  connectionStatus: "unknown",
  lastError: "",
  fontSize: "large",
  fontFamily: "monospace",
  boldText: true,
  alignment: "center",
  marginMm: 2,
  lineSpacing: 1.35,
  printDensity: "normal",
  printSpeed: "normal",
  cutPaper: true,
  frontCashier: {
    ...CASHIER_DEFAULT,
    label: "Front Cashier",
    enabled: true,
    categories: [],
  },
  backCashier: {
    ...CASHIER_DEFAULT,
    label: "Back Cashier",
    enabled: false,
    categories: [],
  },
};

let settings = structuredClone
  ? structuredClone(PRINTER_DEFAULTS)
  : JSON.parse(JSON.stringify(PRINTER_DEFAULTS));
let loaded = false;
let request = null;
const listeners = new Set();
const recentJobKeys = new Map();

const emit = () => listeners.forEach((fn) => fn(settings));

function normalizeConnection(value) {
  const raw = String(value || "Network");
  if (raw === "QZ Tray" || raw === "RawBT" || raw === "USB") return "Network";
  if (["Network", "Browser"].includes(raw)) return raw;
  return "Network";
}

function normalizeCashier(raw, fallback) {
  const base = { ...fallback, ...(raw || {}) };
  return {
    ...base,
    enabled: base.enabled !== false,
    connection: "Network",
    networkHost: String(base.networkHost || "").trim(),
    networkPort: Number(base.networkPort) > 0 ? Number(base.networkPort) : 9100,
    printerName: String(base.printerName || "").trim(),
    categories: Array.isArray(base.categories)
      ? base.categories.map((c) => String(c).trim()).filter(Boolean)
      : [],
    label: String(base.label || fallback.label || "Cashier"),
  };
}

function effectivePaperWidth(cfg = settings) {
  if (cfg.autoDetectPaperWidth) {
    // Soft detection: prefer configured width; 80mm default when unknown.
    return Number(cfg.paperWidth) === 58 ? 58 : Number(cfg.customPaperWidthMm) || 80;
  }
  if (String(cfg.paperWidth) === "custom") {
    return Math.max(40, Math.min(120, Number(cfg.customPaperWidthMm) || 80));
  }
  return Number(cfg.paperWidth) === 58 ? 58 : 80;
}

function styleFromSettings(cfg = settings) {
  return {
    paperWidth: effectivePaperWidth(cfg),
    fontSize: cfg.fontSize || "large",
    fontFamily: cfg.fontFamily || "monospace",
    boldText: cfg.boldText !== false,
    alignment: cfg.alignment || "center",
    marginMm: Number(cfg.marginMm) >= 0 ? Number(cfg.marginMm) : 2,
    lineSpacing: Number(cfg.lineSpacing) || 1.35,
    printDensity: cfg.printDensity || "normal",
    printSpeed: cfg.printSpeed || "normal",
    cutPaper: cfg.cutPaper !== false,
  };
}

export function printerSettings() {
  return settings;
}

export function subscribeToPrinter(listener) {
  listeners.add(listener);
  listener(settings);
  return () => listeners.delete(listener);
}

export function applyPrinterSettings(next) {
  const merged = {
    ...PRINTER_DEFAULTS,
    ...next,
    connection: normalizeConnection(next?.connection ?? PRINTER_DEFAULTS.connection),
    frontCashier: normalizeCashier(
      next?.frontCashier,
      PRINTER_DEFAULTS.frontCashier
    ),
    backCashier: normalizeCashier(
      next?.backCashier,
      PRINTER_DEFAULTS.backCashier
    ),
  };

  // Migrate legacy single-host into front cashier when needed.
  if (!merged.frontCashier.networkHost && merged.networkHost) {
    merged.frontCashier.networkHost = merged.networkHost;
    merged.frontCashier.networkPort = merged.networkPort || 9100;
  }

  settings = merged;
  loaded = true;
  emit();
  return settings;
}

export function loadPrinterSettings(force = false) {
  if (loaded && !force) return Promise.resolve(settings);
  if (!request) {
    request = settingsApi
      .getPrinter()
      .then((data) => {
        request = null;
        return applyPrinterSettings(data.printer);
      })
      .catch(() => {
        request = null;
        return settings;
      });
  }
  return request;
}

function guardDuplicate(key, windowMs = 2500) {
  const now = Date.now();
  const prev = recentJobKeys.get(key) || 0;
  if (now - prev < windowMs) {
    throw new Error("Duplicate print prevented — please wait a moment.");
  }
  recentJobKeys.set(key, now);
  for (const [k, t] of recentJobKeys) {
    if (now - t > 15_000) recentJobKeys.delete(k);
  }
}

async function sendToCashier(cashier, kind, order, businessName) {
  if (!cashier?.enabled) return null;
  const host = String(cashier.networkHost || "").trim();
  if (!host) {
    throw new Error(
      `${cashier.label || "Cashier"} printer IP is not configured in Printer Settings.`
    );
  }
  const style = {
    ...styleFromSettings(),
    businessName: businessName || "Amoons",
  };
  const bytes = buildEscPos(kind, { ...order, cashierLabel: cashier.label }, style);
  const copies = Math.min(Math.max(Number(settings.copies) || 1, 1), 5);
  let last = null;
  for (let i = 0; i < copies; i += 1) {
    last = await printRawToNetwork({
      host,
      port: cashier.networkPort || 9100,
      bytes,
    });
  }
  return last;
}

function splitKotByCashier(order) {
  const front = settings.frontCashier;
  const back = settings.backCashier;
  const items = Array.isArray(order?.items) ? order.items : [];

  if (!back?.enabled || !back.categories?.length) {
    return {
      frontItems: items,
      backItems: [],
    };
  }

  const backSet = new Set(back.categories.map((c) => c.toLowerCase()));
  const frontItems = [];
  const backItems = [];
  for (const item of items) {
    const cat = String(item.category || "").toLowerCase();
    if (cat && backSet.has(cat)) backItems.push(item);
    else frontItems.push(item);
  }
  return { frontItems, backItems };
}

async function printKotRouted(order, businessName) {
  const { frontItems, backItems } = splitKotByCashier(order);
  const results = [];

  if (backItems.length && settings.backCashier?.enabled) {
    results.push(
      await sendToCashier(
        settings.backCashier,
        "kot",
        { ...order, items: backItems },
        businessName
      )
    );
  }

  if (frontItems.length && settings.frontCashier?.enabled !== false) {
    results.push(
      await sendToCashier(
        settings.frontCashier,
        "kot",
        { ...order, items: frontItems },
        businessName
      )
    );
  } else if (!backItems.length) {
    // Fallback: nothing assigned — print full KOT to front
    results.push(
      await sendToCashier(
        settings.frontCashier,
        "kot",
        order,
        businessName
      )
    );
  }

  return results.some(Boolean);
}

async function printBillRouted(order, businessName) {
  const target =
    settings.frontCashier?.enabled !== false
      ? settings.frontCashier
      : settings.backCashier;
  const result = await sendToCashier(target, "bill", order, businessName);
  return Boolean(result);
}

/**
 * Checkout / Order Management print entry-point.
 * mode: "bill" | "kitchen"|"kot" | "both"
 */
export async function printSaleBundle(order, receiptProfiles = {}) {
  if (!order) return null;
  if (!loaded) await loadPrinterSettings();
  if (typeof window === "undefined") {
    throw new Error("Printing is not supported in this environment.");
  }

  if (normalizeConnection(settings.connection) === "Browser") {
    throw new Error(
      "Browser print dialog is disabled for POS. Configure Network printing with the Local Print Agent or Android APK."
    );
  }

  const mode = String(receiptProfiles.mode || "both").toLowerCase();
  const businessName =
    receiptProfiles.business?.name ||
    order.businessName ||
    "Amoons";

  const dedupeKey = `${mode}:${order.id || order.orderNumber}:${(order.items || [])
    .map((i) => `${i.name}:${i.quantity}`)
    .join("|")}`;
  guardDuplicate(dedupeKey);

  let sent = false;
  if (mode === "kitchen" || mode === "kot") {
    sent = await printKotRouted(order, businessName);
  } else if (mode === "both") {
    sent = await printKotRouted(order, businessName);
    sent = (await printBillRouted(order, businessName)) || sent;
  } else {
    sent = await printBillRouted(order, businessName);
  }

  if (!sent) {
    throw new Error(
      "Print failed. Check printer IP, Local Print Agent / Android APK, and try Test Receipt."
    );
  }

  const label =
    mode === "kitchen" || mode === "kot"
      ? "KOT"
      : mode === "both"
        ? "KOT + bill"
        : "Bill";

  return `${label} sent to network printer (${effectivePaperWidth()}mm)`;
}

export async function testPrinterConnection() {
  if (!loaded) await loadPrinterSettings();
  const host =
    settings.frontCashier?.networkHost ||
    settings.networkHost ||
    "";
  const port =
    settings.frontCashier?.networkPort ||
    settings.networkPort ||
    9100;
  return probeNetworkPrinter(host, port);
}

export async function testPrintReceipt(sampleOrder, businessName = "Amoons") {
  if (!loaded) await loadPrinterSettings();
  return printSaleBundle(sampleOrder, {
    mode: "bill",
    business: { name: businessName },
  });
}

function beep() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  try {
    const context = new Ctx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.14;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    oscillator.stop(context.currentTime + 0.5);
    oscillator.onended = () => context.close();
    return true;
  } catch {
    return false;
  }
}

export function playOrderAlertTone() {
  if (typeof window === "undefined") return false;
  return beep();
}

export function playWebsiteOrderAlert() {
  if (typeof window === "undefined") return false;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return playOrderAlertTone();
  try {
    const context = new Ctx();
    [784, 988, 1174].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.22;
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
    });
    window.setTimeout(() => {
      try {
        context.close();
      } catch {
        /* ignore */
      }
    }, 900);
    return true;
  } catch {
    return playOrderAlertTone();
  }
}

export function announceNewOrder(order) {
  if (!settings.voiceAlert) return null;
  const spoken = `${order?.orderNumber ?? "New"} order received`;
  if (typeof window === "undefined") return null;
  if (window.speechSynthesis) {
    try {
      const utterance = new window.SpeechSynthesisUtterance(spoken);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
      return "speech";
    } catch {
      /* tone */
    }
  }
  return beep() ? "tone" : null;
}

export const voiceAlertSupported = () =>
  typeof window !== "undefined" &&
  Boolean(window.speechSynthesis || window.AudioContext || window.webkitAudioContext);

export function printAvailable() {
  return typeof window !== "undefined";
}

export function testSample(items = [], orderNumber = "TEST-PRINT") {
  const now = new Date().toISOString();
  const lines = items.slice(0, 3).map((item) => {
    const price = Number(item.price) || 0;
    return { name: item.name, quantity: 1, price, lineTotal: price, category: item.category };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return {
    orderNumber,
    createdAt: now,
    channel: "Dine-In",
    status: "Completed",
    items: lines.length
      ? lines
      : [{ name: "Test item", quantity: 1, price: 100, lineTotal: 100 }],
    subtotal: subtotal || 100,
    discountAmount: 0,
    discountType: "none",
    taxTotal: 0,
    total: subtotal || 100,
    paymentMethod: "Cash",
    amountPaid: subtotal || 100,
    paymentStatus: "Paid",
    balanceDue: 0,
    customerPhone: "",
    note: "Printer settings test — no order was created.",
  };
}

// Compatibility exports used by receipt.js callers
export async function printReceipt(order, options = {}) {
  return printSaleBundle(order, { ...options, mode: "bill" });
}

export async function printKitchenTicket(order, options = {}) {
  return printSaleBundle(order, { ...options, mode: "kitchen" });
}

export async function printKitchenAndBill(order, options = {}) {
  return printSaleBundle(order, { ...options, mode: "both" });
}
