import { getDisplayPreferences } from "./preferences";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value) {
  const currency = getDisplayPreferences().currency || "Rs";
  return `${currency} ${money.format(Number.isFinite(Number(value)) ? Number(value) : 0)}`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(
    Number.isFinite(Number(value)) ? Number(value) : 0
  );
}

function parts(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(iso) {
  const date = parts(iso);
  if (!date) return "--:--";

  const hour12 = getDisplayPreferences().timeFormat.startsWith("12");
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12,
  });
}

export function formatDay(iso) {
  const date = parts(iso);
  if (!date) return "";

  const format = getDisplayPreferences().dateFormat;
  if (format === "dd/MM/yyyy") {
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }
  if (format === "yyyy-MM-dd") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso) {
  const date = parts(iso);
  if (!date) return "";

  const dateFormat = getDisplayPreferences().dateFormat;
  const dateLabel =
    dateFormat === "dd/MM/yyyy"
      ? `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
      : dateFormat === "yyyy-MM-dd"
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        : date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
  return `${dateLabel} · ${formatTime(iso)}`;
}

/** Local calendar day as YYYY-MM-DD, which is what the API filters expect. */
export function toISODate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** "Today" / "Yesterday" / "3 days ago" for a created-at timestamp. */
export function formatRelativeDay(iso) {
  const date = parts(iso);
  if (!date) return "";

  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86400000
  );

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export function initials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";

  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}
