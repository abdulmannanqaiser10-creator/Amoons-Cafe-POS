const db = require("../config/db");
const {
  badRequest,
  serverError,
  round2,
  toNumber,
  text,
} = require("../helpers/http");
const {
  SETTINGS_DEFAULTS,
  readSettings,
  writeSettings,
  clearSettings,
} = require("./settingsStore");
const {
  publicIntegrations,
  isMaskedSecret,
} = require("../services/srbService");

const KEYS = ["business", "tax", "receipt", "security", "integrations"];

/** Base64 chars for a ~200 KB image (4/3 expansion plus the data-URL prefix). */
const LOGO_MAX_CHARS = 274000;

const validators = {
  business(body) {
    const problems = [];

    const name = text(body.name, 120);
    if (!name) problems.push("Business name is required.");

    const email = text(body.email, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      problems.push("Email address is not valid.");
    }

    // The logo is an inline base64 image (the panel has no file storage to
    // point at), so it is validated as a whole rather than through text(),
    // which would chop the tail off a long data URL.
    const rawLogo = typeof body.logo === "string" ? body.logo.trim() : "";
    if (rawLogo.length > LOGO_MAX_CHARS) {
      problems.push("Logo image is too large; keep it under 200 KB.");
    } else if (
      rawLogo !== "" &&
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(rawLogo)
    ) {
      problems.push("Logo must be a PNG, JPEG or WebP image.");
    }

    return {
      problems,
      value: {
        name: name ?? SETTINGS_DEFAULTS.business.name,
        tagline: text(body.tagline, 120) ?? "",
        logo: rawLogo,
        phone: text(body.phone, 40) ?? "",
        email: email ?? "",
        address: text(body.address, 300) ?? "",
        taxNumber: text(body.taxNumber, 60) ?? "",
        currency: text(body.currency, 8) ?? "Rs",
      },
    };
  },

  /**
   * The rate is stored as a percentage of the net amount. Whether the menu
   * prices already contain it is a separate switch, because both models are
   * legal and they produce different bills.
   */
  tax(body) {
    const problems = [];

    const enabled = body.enabled === true;
    const rate = round2(toNumber(body.rate, 0));

    if (rate < 0 || rate > 100) problems.push("Tax rate must be between 0 and 100.");

    const label = text(body.label, 40) ?? "Sales tax";

    return {
      problems,
      value: {
        enabled,
        rate: enabled ? rate : 0,
        label,
        inclusive: enabled && body.inclusive === true,
      },
    };
  },

  receipt(body) {
    const flag = (value, fallback) =>
      typeof value === "boolean" ? value : fallback;

    return {
      problems: [],
      value: {
        showBusinessName: flag(body.showBusinessName, true),
        showTaxNumber: flag(body.showTaxNumber, false),
        showPaymentDetails: flag(body.showPaymentDetails, true),
        showItemPrices: flag(body.showItemPrices, true),
        headerMessage: text(body.headerMessage, 120) ?? "",
        footerMessage: text(body.footerMessage, 160) ?? "",
      },
    };
  },

  security(body) {
    const problems = [];

    const idleLockMinutes = Math.trunc(toNumber(body.idleLockMinutes, 0));
    if (!Number.isInteger(idleLockMinutes) || idleLockMinutes < 0 || idleLockMinutes > 240) {
      problems.push("Idle lock must be between 0 and 240 minutes (0 turns it off).");
    }

    return {
      problems,
      value: {
        idleLockMinutes,
        requireManagerPinForReversal: body.requireManagerPinForReversal === true,
      },
    };
  },

  integrations(body) {
    const problems = [];
    const rate = round2(toNumber(body.srbTaxRate, 15));
    if (rate < 0 || rate > 100) {
      problems.push("SRB tax rate must be between 0 and 100.");
    }

    const transType =
      String(body.srbTransType || "Live").toLowerCase() === "test"
        ? "Test"
        : "Live";
    const srbMode =
      String(body.srbMode || "cloud").toLowerCase() === "offline"
        ? "offline"
        : "cloud";

    return {
      problems,
      value: {
        srbEnabled: body.srbEnabled === true,
        srbMode,
        srbPosId: text(body.srbPosId, 40) ?? "",
        srbPosKey: text(body.srbPosKey, 80) ?? "",
        srbPosUser: text(body.srbPosUser, 80) ?? "",
        srbPosPass: text(body.srbPosPass, 120) ?? "",
        srbApiUrl:
          text(body.srbApiUrl, 300) ??
          (srbMode === "offline"
            ? "http://localhost:8282/pos/SalesInvoiceServices"
            : "https://pos.srb.gos.pk/ePOSGateway/v1/SalesInvoiceService.api"),
        srbTransType: transType,
        srbTaxRate: rate || 15,
        srbNtn: text(body.srbNtn, 40) ?? "",
        srbMerchantId: text(body.srbMerchantId, 80) ?? "",
        srbApiKey: text(body.srbApiKey, 200) ?? "",
        websiteEnabled: body.websiteEnabled === true,
        websiteStoreUrl: text(body.websiteStoreUrl, 300) ?? "",
        websiteApiKey: text(body.websiteApiKey, 200) ?? "",
        accountingEnabled: body.accountingEnabled === true,
        accountingProvider: text(body.accountingProvider, 80) ?? "",
        accountingCode: text(body.accountingCode, 80) ?? "",
        deliveryEnabled: body.deliveryEnabled === true,
        deliveryPartner: text(body.deliveryPartner, 80) ?? "",
        deliveryApiKey: text(body.deliveryApiKey, 200) ?? "",
      },
    };
  },
};

/* ------------------------------------------------------------------ */
/* GET /api/settings/company                                           */
/* ------------------------------------------------------------------ */

exports.company = async (req, res) => {
  try {
    const loaded = await Promise.all(KEYS.map((key) => readSettings(key)));

    const settings = KEYS.reduce((acc, key, index) => {
      const value = loaded[index].value;
      acc[key] =
        key === "integrations" ? publicIntegrations(value) : value;
      acc[`${key}Meta`] = {
        updatedAt: loaded[index].updatedAt,
        updatedByName: loaded[index].updatedByName,
      };
      return acc;
    }, {});

    res.json({
      settings,
      defaults: SETTINGS_DEFAULTS,
      // The panel is the only writer; the till still reads these to render
      // totals correctly, so a cashier needs to know they cannot change them.
      canEdit: req.user.role === "admin",
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* PUT /api/settings/:key                                              */
/* ------------------------------------------------------------------ */

exports.save = async (req, res) => {
  try {
    const key = req.params.key;
    if (!KEYS.includes(key)) return badRequest(res, "Unknown settings profile.");

    const { problems, value } = validators[key](req.body ?? {});
    if (problems.length) return badRequest(res, problems.join(" "));

    let nextValue = value;
    if (key === "integrations") {
      const existing = await readSettings("integrations");
      const previous = existing.value || {};
      const secretFields = [
        "srbPosPass",
        "srbPosKey",
        "srbApiKey",
        "websiteApiKey",
        "deliveryApiKey",
      ];
      nextValue = { ...value };
      for (const field of secretFields) {
        if (isMaskedSecret(nextValue[field])) {
          nextValue[field] = previous[field] || "";
        }
      }
    }

    await writeSettings(key, nextValue, req.user.id);

    const saved = await readSettings(key);
    const responseValue =
      key === "integrations"
        ? publicIntegrations(saved.value)
        : saved.value;

    res.json({
      message: `${key[0].toUpperCase()}${key.slice(1)} settings saved`,
      [key]: responseValue,
      meta: { updatedAt: saved.updatedAt, updatedByName: saved.updatedByName },
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /api/settings/:key — back to factory values                  */
/* ------------------------------------------------------------------ */

exports.reset = async (req, res) => {
  try {
    const key = req.params.key;
    if (!KEYS.includes(key)) return badRequest(res, "Unknown settings profile.");

    await clearSettings(key);

    res.json({
      message: `${key[0].toUpperCase()}${key.slice(1)} settings reset`,
      [key]: SETTINGS_DEFAULTS[key],
    });
  } catch (error) {
    serverError(res, error);
  }
};

/**
 * Applies the stored tax profile to a net subtotal. Kept next to the
 * validator so the rule the admin configures is the rule the order writes.
 */
function applyTax(subtotal, tax) {
  if (!tax?.enabled || !(tax.rate > 0)) {
    return { taxAmount: 0, total: round2(subtotal), rate: 0 };
  }

  const rate = round2(tax.rate);

  if (tax.inclusive) {
    // Prices already carry the tax, so the bill shows it as part of the total.
    const net = round2(subtotal / (1 + rate / 100));
    return {
      taxAmount: round2(subtotal - net),
      total: round2(subtotal),
      rate,
      inclusive: true,
      net,
    };
  }

  const taxAmount = round2((subtotal * rate) / 100);

  return {
    taxAmount,
    total: round2(subtotal + taxAmount),
    rate,
    inclusive: false,
  };
}

exports.applyTax = applyTax;
