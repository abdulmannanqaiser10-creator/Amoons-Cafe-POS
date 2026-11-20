const db = require("../config/db");

const PRINTER_KEY = "printer";

const PRINTER_DEFAULTS = {
  printerName: "Counter Receipt Printer",
  printerType: "Both",
  connection: "QZ Tray",
  paperWidth: 80,
  copies: 1,
  autoPrintReceipt: true,
  autoPrintKitchen: true,
  voiceAlert: false,
};

const PRINTER_TYPES = ["Receipt", "Kitchen", "Both"];
const CONNECTIONS = ["QZ Tray", "Browser", "Network", "USB"];
const PAPER_WIDTHS = [58, 80];

// QZ Tray is the supported silent path for thermal printers on the till PC.
// Browser keeps the legacy print-dialog path as a manual fallback.
const CAPABILITIES = {
  connections: CONNECTIONS.map((id) => ({
    id,
    available: id === "QZ Tray" || id === "Browser",
    note:
      id === "QZ Tray"
        ? "Silent direct print via QZ Tray (install + keep running on this PC)."
        : id === "Browser"
          ? "Opens the browser print dialog (not used for silent POS printing)."
          : `Requires a ${id === "USB" ? "USB" : "network"} print agent on this machine.`,
  })),
  copies: { min: 1, max: 5 },
  silentPrinting: true,
  silentPrintingRequires: "QZ Tray desktop app on the POS terminal",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const badRequest = (res, message) => res.status(400).json({ message });

const serverError = (res, error) => {
  console.error(error);
  res.status(500).json({ message: "Server error" });
};

const asBoolean = (value, fallback) =>
  typeof value === "boolean" ? value : fallback;

/**
 * Validates the payload against the defaults, so a saved record can never hold
 * a value the print pipeline would not understand.
 */
function normalisePrinter(body) {
  const problems = [];

  const name = String(body.printerName ?? PRINTER_DEFAULTS.printerName).trim();

  if (!name) problems.push("Printer name is required");
  if (name.length > 60) problems.push("Printer name is too long (60 max)");

  const printerType = String(
    body.printerType ?? PRINTER_DEFAULTS.printerType
  );
  if (!PRINTER_TYPES.includes(printerType)) {
    problems.push("Printer type must be Receipt, Kitchen or Both");
  }

  const connection = String(body.connection ?? PRINTER_DEFAULTS.connection);
  if (!CONNECTIONS.includes(connection)) {
    problems.push("Unknown connection method");
  }

  const paperWidth = Number(body.paperWidth ?? PRINTER_DEFAULTS.paperWidth);
  if (!PAPER_WIDTHS.includes(paperWidth)) {
    problems.push("Paper width must be 58 mm or 80 mm");
  }

  const copies = Number(body.copies ?? PRINTER_DEFAULTS.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > 5) {
    problems.push("Copies must be a whole number between 1 and 5");
  }

  if (problems.length) return { problems };

  return {
    settings: {
      printerName: name.slice(0, 60),
      printerType,
      connection,
      paperWidth,
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
    },
  };
}

function mapSettings(row) {
  return {
    ...PRINTER_DEFAULTS,
    ...(row?.value ?? {}),
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updated_by_name ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* GET /api/settings/printer                                           */
/* ------------------------------------------------------------------ */

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
      },
      capabilities: CAPABILITIES,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* PUT /api/settings/printer                                           */
/* ------------------------------------------------------------------ */

exports.savePrinter = async (req, res) => {
  try {
    const { problems, settings } = normalisePrinter(req.body ?? {});

    if (problems) return badRequest(res, problems.join(". "));

    await db.query(
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (key) DO UPDATE
         SET value      = EXCLUDED.value,
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

/* ------------------------------------------------------------------ */
/* DELETE /api/settings/printer — back to factory defaults             */
/* ------------------------------------------------------------------ */

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
