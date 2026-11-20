const db = require("../config/db");

/**
 * Factory values for every settings profile the app stores as JSONB. A key
 * with no row reads as these defaults, and saving resets it to them, so
 * "reset" never needs a migration to undo itself.
 */
const SETTINGS_DEFAULTS = {
  business: {
    name: "Amoons",
    tagline: "Smart. Secure. Seamless.",
    logo: "",
    phone: "",
    email: "",
    address: "",
    taxNumber: "",
    currency: "Rs",
  },
  tax: {
    enabled: true,
    rate: 16,
    label: "Sales tax",
    inclusive: false,
  },
  receipt: {
    showBusinessName: true,
    showTaxNumber: false,
    showPaymentDetails: true,
    showItemPrices: true,
    headerMessage: "",
    footerMessage: "Thank you for your order.",
  },
  security: {
    idleLockMinutes: 0,
    requireManagerPinForReversal: false,
  },
  integrations: {
    srbEnabled: false,
    srbPosId: "",
    srbPosKey: "",
    srbPosUser: "",
    srbPosPass: "",
    srbApiUrl: "https://pos.srb.gos.pk/ePOSGateway/v1/SalesInvoiceService.api",
    srbTransType: "Live",
    srbTaxRate: 15,
    srbMerchantId: "",
    srbApiKey: "",
    websiteEnabled: false,
    websiteStoreUrl: "",
    websiteApiKey: "",
    accountingEnabled: false,
    accountingProvider: "",
    accountingCode: "",
    deliveryEnabled: false,
    deliveryPartner: "",
    deliveryApiKey: "",
  },
};

/**
 * Reads one profile. Returns the stored object merged over the defaults, so a
 * setting added after a terminal saved its profile still has a sane value
 * instead of undefined.
 */
async function readSettings(key, client = db) {
  const defaults = SETTINGS_DEFAULTS[key];

  if (!defaults) throw new Error(`Unknown settings key: ${key}`);

  const result = await client.query(
    `SELECT s.value, s.updated_at, u.display_name AS updated_by_name
       FROM app_settings s
       LEFT JOIN users u ON u.id = s.updated_by
      WHERE s.key = $1`,
    [key]
  );

  const row = result.rows[0];

  return {
    value: { ...defaults, ...(row?.value ?? {}) },
    defaults,
    updatedAt: row?.updated_at ?? null,
    updatedByName: row?.updated_by_name ?? null,
  };
}

async function writeSettings(key, value, userId, client = db) {
  await client.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, now())
     ON CONFLICT (key) DO UPDATE
       SET value      = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [key, JSON.stringify(value), userId]
  );
}

async function clearSettings(key, client = db) {
  await client.query("DELETE FROM app_settings WHERE key = $1", [key]);
}

module.exports = { SETTINGS_DEFAULTS, readSettings, writeSettings, clearSettings };
