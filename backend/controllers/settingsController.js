const db = require("../config/db");

const PRINTER_KEY = "printer";

const CASHIER_DEFAULT = {
  enabled: true,
  connection: "Network",
  networkHost: "",
  networkPort: 9100,
  printerName: "",
  categories: [],
};

const PRINTER_DEFAULTS = {
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
  },
  backCashier: {
    ...CASHIER_DEFAULT,
    label: "Back Cashier",
    enabled: false,
  },
};

const PRINTER_TYPES = ["Receipt", "Kitchen", "Both"];
const CONNECTIONS = ["Network", "Browser"];
const PAPER_WIDTHS = [58, 80, "custom"];
const FONT_SIZES = ["small", "normal", "large", "xlarge"];
const ALIGNMENTS = ["left", "center", "right"];
const DENSITIES = ["light", "normal", "dark"];
const SPEEDS = ["slow", "normal", "fast"];

const CAPABILITIES = {
  connections: [
    {
      id: "Network",
      available: true,
      note: "Direct RAW TCP/IP via Local Print Agent (Windows) or Android APK.",
    },
    {
      id: "Browser",
      available: false,
      note: "Disabled for silent POS printing.",
    },
  ],
  copies: { min: 1, max: 5 },
  paperWidths: PAPER_WIDTHS,
  fontSizes: FONT_SIZES,
  alignments: ALIGNMENTS,
  printDensities: DENSITIES,
  printSpeeds: SPEEDS,
  silentPrinting: true,
  silentPrintingRequires: "Local Print Agent or Amoons Android APK",
  dualCashier: true,
};

const badRequest = (res, message) => res.status(400).json({ message });
const serverError = (res, error) => {
  console.error(error);
  res.status(500).json({ message: "Server error" });
};
const asBoolean = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;

function normalizeConnection(value) {
  const raw = String(value || "Network");
  if (raw === "QZ Tray" || raw === "RawBT" || raw === "USB") return "Network";
  if (CONNECTIONS.includes(raw)) return raw;
  return "Network";
}

function normalizeCashier(body, fallback) {
  const src = body && typeof body === "object" ? body : {};
  const categories = Array.isArray(src.categories)
    ? src.categories.map((c) => String(c).trim()).filter(Boolean).slice(0, 40)
    : fallback.categories || [];
  return {
    label: String(src.label || fallback.label || "Cashier").slice(0, 40),
    enabled: asBoolean(src.enabled, fallback.enabled !== false),
    connection: "Network",
    networkHost: String(src.networkHost ?? "").trim().slice(0, 120),
    networkPort: (() => {
      const port = Number(src.networkPort ?? fallback.networkPort ?? 9100);
      return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 9100;
    })(),
    printerName: String(src.printerName ?? "").trim().slice(0, 60),
    categories,
  };
}

function normalisePrinter(body = {}) {
  const problems = [];
  const connection = normalizeConnection(body.connection);
  const frontCashier = normalizeCashier(body.frontCashier, PRINTER_DEFAULTS.frontCashier);
  const backCashier = normalizeCashier(body.backCashier, PRINTER_DEFAULTS.backCashier);

  // Legacy single host → front cashier
  if (!frontCashier.networkHost && body.networkHost) {
    frontCashier.networkHost = String(body.networkHost).trim().slice(0, 120);
    frontCashier.networkPort = Number(body.networkPort) || 9100;
  }

  if (frontCashier.enabled && !frontCashier.networkHost) {
    problems.push("Front Cashier printer IP address is required");
  }
  if (backCashier.enabled && !backCashier.networkHost) {
    problems.push("Back Cashier printer IP address is required when enabled");
  }

  const printerType = String(body.printerType ?? PRINTER_DEFAULTS.printerType);
  if (!PRINTER_TYPES.includes(printerType)) {
    problems.push("Printer type must be Receipt, Kitchen or Both");
  }

  let paperWidth = body.paperWidth ?? PRINTER_DEFAULTS.paperWidth;
  if (paperWidth === "custom" || String(paperWidth) === "custom") {
    paperWidth = "custom";
  } else {
    paperWidth = Number(paperWidth);
    if (![58, 80].includes(paperWidth)) {
      problems.push("Paper width must be 58 mm, 80 mm, or custom");
    }
  }

  const customPaperWidthMm = Math.max(
    40,
    Math.min(120, Number(body.customPaperWidthMm) || 80)
  );
  const copies = Number(body.copies ?? PRINTER_DEFAULTS.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > 5) {
    problems.push("Copies must be a whole number between 1 and 5");
  }

  const fontSize = FONT_SIZES.includes(String(body.fontSize || "").toLowerCase())
    ? String(body.fontSize).toLowerCase()
    : "large";
  const alignment = ALIGNMENTS.includes(String(body.alignment || "").toLowerCase())
    ? String(body.alignment).toLowerCase()
    : "center";
  const printDensity = DENSITIES.includes(String(body.printDensity || "").toLowerCase())
    ? String(body.printDensity).toLowerCase()
    : "normal";
  const printSpeed = SPEEDS.includes(String(body.printSpeed || "").toLowerCase())
    ? String(body.printSpeed).toLowerCase()
    : "normal";

  if (problems.length) return { problems };

  return {
    settings: {
      printerName: String(
        body.printerName ||
          frontCashier.printerName ||
          PRINTER_DEFAULTS.printerName
      ).trim().slice(0, 60),
      printerType,
      connection,
      paperWidth,
      customPaperWidthMm,
      autoDetectPaperWidth: asBoolean(
        body.autoDetectPaperWidth,
        PRINTER_DEFAULTS.autoDetectPaperWidth
      ),
      copies,
      autoPrintReceipt: asBoolean(
        body.autoPrintReceipt,
        PRINTER_DEFAULTS.autoPrintReceipt
      ),
      autoPrintKitchen: asBoolean(
        body.autoPrintKitchen,
        PRINTER_DEFAULTS.autoPrintKitchen
      ),
      voiceAlert: asBoolean(body.voiceAlert, PRINTER_DEFAULTS.voiceAlert),
      networkHost: frontCashier.networkHost,
      networkPort: frontCashier.networkPort,
      connectionStatus: String(body.connectionStatus || "unknown").slice(0, 40),
      lastError: String(body.lastError || "").slice(0, 300),
      fontSize,
      fontFamily: String(body.fontFamily || "monospace").slice(0, 40),
      boldText: asBoolean(body.boldText, true),
      alignment,
      marginMm: Math.max(0, Math.min(10, Number(body.marginMm) || 2)),
      lineSpacing: Math.max(1, Math.min(2.5, Number(body.lineSpacing) || 1.35)),
      printDensity,
      printSpeed,
      cutPaper: asBoolean(body.cutPaper, true),
      frontCashier,
      backCashier,
    },
  };
}

function mapSettings(row) {
  const merged = {
    ...PRINTER_DEFAULTS,
    ...(row?.value ?? {}),
  };
  merged.connection = normalizeConnection(merged.connection);
  merged.frontCashier = normalizeCashier(
    merged.frontCashier,
    PRINTER_DEFAULTS.frontCashier
  );
  merged.backCashier = normalizeCashier(
    merged.backCashier,
    PRINTER_DEFAULTS.backCashier
  );
  if (!merged.frontCashier.networkHost && merged.networkHost) {
    merged.frontCashier.networkHost = merged.networkHost;
    merged.frontCashier.networkPort = merged.networkPort || 9100;
  }
  return {
    ...merged,
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updated_by_name ?? null,
  };
}

exports.getPrinter = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.key, s.value, s.updated_at, u.display_name AS updated_by_name
         FROM app_settings s
         LEFT JOIN users u ON u.id = s.updated_by
        WHERE s.key = $1`,
      [PRINTER_KEY]
    );
    res.json({
      printer: mapSettings(result.rows[0]),
      defaults: PRINTER_DEFAULTS,
      options: {
        printerTypes: PRINTER_TYPES,
        connections: CONNECTIONS,
        paperWidths: PAPER_WIDTHS,
        fontSizes: FONT_SIZES,
        alignments: ALIGNMENTS,
        printDensities: DENSITIES,
        printSpeeds: SPEEDS,
      },
      capabilities: CAPABILITIES,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.savePrinter = async (req, res) => {
  try {
    const { problems, settings } = normalisePrinter(req.body ?? {});
    if (problems) return badRequest(res, problems.join(". "));

    await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
      [PRINTER_KEY, JSON.stringify(settings), req.user.id]
    );

    const saved = await db.query(
      `SELECT s.value, s.updated_at, u.display_name AS updated_by_name
         FROM app_settings s
         LEFT JOIN users u ON u.id = s.updated_by
        WHERE s.key = $1`,
      [PRINTER_KEY]
    );

    res.json({
      message: "Printer settings saved",
      printer: mapSettings(saved.rows[0]),
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.resetPrinter = async (req, res) => {
  try {
    await db.query("DELETE FROM app_settings WHERE key = $1", [PRINTER_KEY]);
    res.json({
      message: "Printer settings reset to defaults",
      printer: PRINTER_DEFAULTS,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.PRINTER_DEFAULTS = PRINTER_DEFAULTS;
