const STORAGE_KEY = "softpos.display-preferences";
const LEGACY_STORAGE_KEY = "lexos.display-preferences";
export const PREFERENCES_CHANGED_EVENT = "softpos:preferences-changed";
const LEGACY_PREFERENCES_EVENT = "lexos:preferences-changed";

export const FONT_SIZE_OPTIONS = [
  { value: "Small", scale: "0.875", px: "14px" },
  { value: "Medium", scale: "1", px: "16px" },
  { value: "Large", scale: "1.125", px: "18px" },
  { value: "Extra Large", scale: "1.25", px: "20px" },
];

export const FONT_STYLE_OPTIONS = [
  { value: "Roboto", family: '"Roboto", Arial, sans-serif' },
  { value: "Inter", family: '"Inter", "Segoe UI", sans-serif' },
  { value: "Poppins", family: '"Poppins", "Segoe UI", sans-serif' },
  { value: "System Sans", family: 'system-ui, "Segoe UI", sans-serif' },
  { value: "Serif", family: 'Georgia, "Times New Roman", serif' },
];

export const DISPLAY_DEFAULTS = {
  language: "English",
  dateFormat: "MMM d, yyyy",
  timeFormat: "12 Hours (AM/PM)",
  currency: "Rs",
  fontSize: "Medium",
  fontStyle: "Roboto",
  showNavigationBar: true,
  showOrderDetails: true,
  orderAlerts: false,
  shiftReminders: false,
  emailNotifications: false,
  theme: "Light",
  density: "Comfortable",
};

function resolveFontSize(value) {
  return (
    FONT_SIZE_OPTIONS.find((option) => option.value === value) ||
    FONT_SIZE_OPTIONS.find((option) => option.value === DISPLAY_DEFAULTS.fontSize)
  );
}

function resolveFontStyle(value) {
  return (
    FONT_STYLE_OPTIONS.find((option) => option.value === value) ||
    FONT_STYLE_OPTIONS.find((option) => option.value === DISPLAY_DEFAULTS.fontStyle)
  );
}

export function applyDisplayPreferences(prefs = getDisplayPreferences()) {
  if (typeof document === "undefined") return prefs;

  const fontSize = resolveFontSize(prefs.fontSize);
  const fontStyle = resolveFontStyle(prefs.fontStyle);
  const root = document.documentElement;

  root.dataset.displayTheme = String(prefs.theme || "Light").toLowerCase();
  root.dataset.displayDensity = String(prefs.density || "Comfortable").toLowerCase();
  root.dataset.fontSize = fontSize.value.toLowerCase().replace(/\s+/g, "-");
  root.dataset.fontStyle = fontStyle.value.toLowerCase().replace(/\s+/g, "-");
  root.dataset.showNav =
    prefs.showNavigationBar === false ? "hidden" : "visible";
  root.style.setProperty("--lex-font-scale", fontSize.scale);
  root.style.setProperty("--lex-font-family", fontStyle.family);
  root.style.fontSize = fontSize.px;
  root.style.fontFamily = fontStyle.family;

  if (document.body) {
    document.body.style.fontFamily = fontStyle.family;
    document.body.style.fontSize = "1rem";
  }

  return prefs;
}

export function getDisplayPreferences() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_KEY) ||
      "{}";
    const saved = JSON.parse(raw);
    return { ...DISPLAY_DEFAULTS, ...saved };
  } catch {
    return { ...DISPLAY_DEFAULTS };
  }
}

export function saveDisplayPreferences(value) {
  const saved = { ...DISPLAY_DEFAULTS, ...value };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  applyDisplayPreferences(saved);
  window.dispatchEvent(new CustomEvent(PREFERENCES_CHANGED_EVENT, { detail: saved }));
  window.dispatchEvent(new CustomEvent(LEGACY_PREFERENCES_EVENT, { detail: saved }));
  return saved;
}
