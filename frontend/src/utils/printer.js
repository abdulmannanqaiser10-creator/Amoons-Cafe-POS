import { settingsApi } from "../api/client";
import {
  printKitchenAndBill,
  printKitchenTicket,
  printReceipt,
} from "./receipt";

export const PRINTER_DEFAULTS = {
  printerName: "Counter Receipt Printer",
  printerType: "Both",
  connection: "Browser",
  paperWidth: 80,
  copies: 1,
  autoPrintReceipt: true,
  autoPrintKitchen: true,
  voiceAlert: false,
};

let settings = { ...PRINTER_DEFAULTS };
let loaded = false;
let request = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(settings));

export function printerSettings() {
  return settings;
}

/** Applies printer settings immediately so the till picks them up without a reload. */
export function subscribeToPrinter(listener) {
  listeners.add(listener);
  listener(settings);

  return () => listeners.delete(listener);
}

export function applyPrinterSettings(next) {
  settings = { ...PRINTER_DEFAULTS, ...next };
  loaded = true;
  emit();

  return settings;
}

/**
 * The till prints without waiting for a round trip: the first checkout kicks
 * off the fetch, later ones read the cache. A failed fetch leaves defaults.
 */
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

/**
 * Checkout print entry-point.
 * mode: "bill" (customer receipt), "kitchen"|"kot" (KOT only), "both" (KOT + bill)
 */
export async function printSaleBundle(order, receiptProfiles = {}) {
  if (!order) return null;

  // Use cached printer settings when available — avoid a network wait before print.
  if (!loaded) await loadPrinterSettings();

  if (settings.connection !== "Browser") {
    throw new Error(
      "Only browser printing is available. Choose Browser in Settings → Printer."
    );
  }

  if (typeof window === "undefined" || typeof window.print !== "function") {
    throw new Error("Printing is not supported in this browser.");
  }

  const mode = String(receiptProfiles.mode || "both").toLowerCase();
  const options = {
    paperWidth: Number(settings.paperWidth) === 58 ? 58 : 80,
    copies: Number(settings.copies) || 1,
    business: receiptProfiles.business,
    receipt: receiptProfiles.receipt,
  };

  let sent = false;

  if (mode === "kitchen" || mode === "kot") {
    sent = await printKitchenTicket(order, options);
  } else if (mode === "both") {
    sent = await printKitchenAndBill(order, options);
  } else {
    sent = await printReceipt(order, options);
  }

  if (!sent) {
    throw new Error("The print dialog could not be opened.");
  }

  const label =
    mode === "kitchen" || mode === "kot"
      ? "KOT"
      : mode === "both"
        ? "KOT + bill"
        : "Bill";

  return `${label} sent (${options.paperWidth}mm, ${options.copies} ${
    options.copies === 1 ? "copy" : "copies"
  })`;
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

/** Always plays a short alert tone (used for new Web orders). */
export function playOrderAlertTone() {
  if (typeof window === "undefined") return false;
  return beep();
}

/** Stronger multi-tone alert for admin website order popups. */
export function playWebsiteOrderAlert() {
  if (typeof window === "undefined") return false;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return playOrderAlertTone();

  try {
    const context = new Ctx();
    const tones = [784, 988, 1174];
    tones.forEach((frequency, index) => {
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

/**
 * Spoken alert if the browser has speech synthesis, otherwise a short tone.
 */
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
      // Fall through to the tone.
    }
  }

  return beep() ? "tone" : null;
}

export const voiceAlertSupported = () =>
  typeof window !== "undefined" &&
  Boolean(window.speechSynthesis || window.AudioContext || window.webkitAudioContext);

export function printAvailable() {
  return typeof window !== "undefined" && typeof window.print === "function";
}

/**
 * A test ticket is built from the live menu.
 */
export function testSample(items = [], orderNumber = "TEST-PRINT") {
  const now = new Date().toISOString();
  const lines = items.slice(0, 3).map((item) => {
    const price = Number(item.price) || 0;

    return { name: item.name, quantity: 1, price, lineTotal: price };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return {
    orderNumber,
    createdAt: now,
    channel: "Dine-In",
    status: "Completed",
    items: lines,
    subtotal,
    discountAmount: 0,
    discountType: "none",
    taxTotal: 0,
    total: subtotal,
    paymentMethod: "Cash",
    amountPaid: subtotal,
    paymentStatus: "Paid",
    balanceDue: 0,
    customerPhone: "",
    note: "This is a settings test — no order was created.",
  };
}
