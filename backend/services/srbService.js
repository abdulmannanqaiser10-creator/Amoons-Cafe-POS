const { round2 } = require("../helpers/http");
const { readSettings, writeSettings } = require("../controllers/settingsStore");

const DEFAULT_CLOUD_URL =
  "https://pos.srb.gos.pk/ePOSGateway/v1/SalesInvoiceService.api";
const DEFAULT_OFFLINE_URL = "http://localhost:8282/pos/SalesInvoiceServices";
const VERIFY_BASE =
  "https://apps.srb.gos.pk/InvoiceVerification/MobileInvoiceStatus.jsp?invoiceVerification=";

const SECRET_MASK = "••••••••";

function normalizeMode(value) {
  return String(value || "cloud").trim().toLowerCase() === "offline"
    ? "offline"
    : "cloud";
}

function envFallback(config = {}) {
  return {
    srbEnabled:
      config.srbEnabled === true ||
      String(process.env.SRB_ENABLED || "").toLowerCase() === "true",
    srbMode: normalizeMode(config.srbMode || process.env.SRB_MODE || "cloud"),
    srbPosId: String(config.srbPosId || process.env.SRB_POS_ID || "").trim(),
    srbPosKey: String(config.srbPosKey || process.env.SRB_POS_KEY || "").trim(),
    srbPosUser: String(
      config.srbPosUser || process.env.SRB_POS_USER || ""
    ).trim(),
    srbPosPass: String(
      config.srbPosPass || process.env.SRB_POS_PASS || ""
    ).trim(),
    srbApiUrl: String(
      config.srbApiUrl ||
        process.env.SRB_API_URL ||
        (normalizeMode(config.srbMode || process.env.SRB_MODE) === "offline"
          ? DEFAULT_OFFLINE_URL
          : DEFAULT_CLOUD_URL)
    ).trim(),
    srbTransType: String(
      config.srbTransType || process.env.SRB_TRANS_TYPE || "Live"
    ).trim(),
    srbTaxRate: Number(config.srbTaxRate || process.env.SRB_TAX_RATE || 0) || 0,
    srbNtn: String(config.srbNtn || process.env.SRB_NTN || "").trim(),
  };
}

function resolveEndpoint(config) {
  if (config.srbMode === "offline") {
    return config.srbApiUrl || DEFAULT_OFFLINE_URL;
  }
  return config.srbApiUrl || DEFAULT_CLOUD_URL;
}

async function loadSrbConfig() {
  const stored = await readSettings("integrations");
  return envFallback(stored.value || {});
}

function maskSecret(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw === SECRET_MASK) return SECRET_MASK;
  if (raw.length <= 4) return SECRET_MASK;
  return `${SECRET_MASK}${raw.slice(-4)}`;
}

function isMaskedSecret(value) {
  const raw = String(value || "");
  return !raw || raw === SECRET_MASK || raw.startsWith("••••");
}

function publicIntegrations(value = {}) {
  const cfg = envFallback(value);
  return {
    ...value,
    ...cfg,
    srbPosPass: maskSecret(cfg.srbPosPass),
    srbPosKey: maskSecret(cfg.srbPosKey),
    srbApiKey: maskSecret(value.srbApiKey || cfg.srbPosKey),
    srbConfigured: Boolean(
      cfg.srbPosId &&
        cfg.srbApiUrl &&
        (cfg.srbMode === "offline" || (cfg.srbPosUser && cfg.srbPosPass))
    ),
  };
}

/** SRB wants NTN without leading S and without hyphen check digit. */
function sanitizeNtn(raw) {
  let ntn = String(raw || "").trim();
  ntn = ntn.replace(/^[Ss]/, "");
  ntn = ntn.replace(/-.*$/, "");
  ntn = ntn.replace(/\D+/g, "");
  return ntn.trim();
}

function stripBusinessName(name) {
  return String(name || "")
    .replace(/[^A-Za-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatInvoiceDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return formatInvoiceDateTime(new Date().toISOString());
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds()
  )}`;
}

function saleValueOf(order) {
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discountAmount) || 0;
  return round2(Math.max(0, subtotal - discount));
}

function resolveRateValue(order, config) {
  // SRB PoS restaurants are 15%. Prefer the dedicated SRB rate when set so
  // fiscal payloads stay compliant even if till tax settings drift.
  if (Number(config.srbTaxRate) > 0) return round2(Number(config.srbTaxRate));
  if (Number(order.taxRate) > 0) return round2(Number(order.taxRate));
  return 15;
}

function buildPayload(order, config, business = {}) {
  const errors = [];
  const mode = normalizeMode(config.srbMode);
  const posId = Number(config.srbPosId);
  const name = stripBusinessName(business.name || "Restaurant");
  const ntn = sanitizeNtn(business.taxNumber || config.srbNtn || "");

  if (!Number.isFinite(posId) || posId <= 0) {
    errors.push("SRB POS ID is required.");
  }
  if (mode === "cloud" && (!config.srbPosUser || !config.srbPosPass)) {
    errors.push("SRB cloud mode requires pos_user and pos_pass.");
  }
  if (!name) errors.push("Business name is required for SRB.");
  if (!ntn) {
    errors.push(
      "Business NTN/tax number is required for SRB (set it in Business Settings or Integrations → Registered NTN)."
    );
  }

  const saleValue = saleValueOf(order);
  if (!(saleValue > 0)) errors.push("Sale value must be greater than zero.");

  const rateValue = resolveRateValue(order, config);
  const serviceCharges = round2(Number(order.serviceCharges) || 0);
  const extraCharges = round2(Number(order.extraCharges) || 0);
  // Discount already removed from saleValue so invoice-level discountAmount is 0.
  const discountAmount = 0;
  const taxAmount = round2(
    (saleValue + serviceCharges + extraCharges) * (rateValue / 100)
  );
  const netAmount = round2(
    saleValue + serviceCharges + extraCharges + taxAmount - discountAmount
  );

  const payload = {
    posId,
    name,
    ntn,
    invoiceDateTime: formatInvoiceDateTime(order.createdAt || order.updatedAt),
    invoiceType: Number(order.invoiceType) === 2 ? 2 : 1,
    invoiceId: String(order.orderNumber || `ORD-${order.id}`).slice(0, 40),
    rateValue,
    saleValue,
    taxAmount,
    discountAmount,
    serviceCharges,
    extraCharges,
    netAmount,
    consumerName:
      order.customerName &&
      String(order.customerName).trim() &&
      !/^customer\s+\d+$/i.test(order.customerName) &&
      !/^walk-?in/i.test(order.customerName)
        ? String(order.customerName).trim().slice(0, 120)
        : "N/A",
    consumerMobile: order.customerPhone
      ? String(order.customerPhone).replace(/\D/g, "").slice(0, 15) || "N/A"
      : "N/A",
    consumerEmail: "N/A",
    consumerNTN: "N/A",
    address: order.deliveryAddress
      ? String(order.deliveryAddress).trim().slice(0, 200)
      : "N/A",
    cpcCode: "N/A",
    extraInf: "N/A",
    modeOfPay: order.paymentMethod === "Card" ? "Card" : "Cash",
    transType:
      String(config.srbTransType || "Live").toLowerCase() === "test"
        ? "Test"
        : "Live",
  };

  // Cloud mode carries gateway credentials in the body. Offline Connector
  // supplies them itself, so they are omitted there.
  if (mode === "cloud") {
    payload.posUser = String(config.srbPosUser || "");
    payload.posPass = String(config.srbPosPass || "");
  }

  return {
    payload,
    errors,
    taxAmount,
    netAmount,
    rateValue,
    saleValue,
    mode,
    endpoint: resolveEndpoint({ ...config, srbMode: mode }),
  };
}

async function postToSrb(apiUrl, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { rawText: text };
    }

    return { httpStatus: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function classifySrbError(body = {}, httpStatus) {
  const error = String(body.error || "");
  if (/invalid pos user\s*\/\s*password/i.test(error) || body.resCode === "02") {
    return (
      `${error || "Invalid POS User / Password."} ` +
      "Confirm pos_user and pos_pass in the SRB POS portal (API credentials for this POS ID), then update Integrations."
    );
  }
  if (body["Required Parameter(s) Missing"]) {
    return `Missing required parameter(s): ${body["Required Parameter(s) Missing"]}`;
  }
  if (httpStatus >= 500) {
    return `SRB service error (HTTP ${httpStatus}).`;
  }
  if (error) return error;
  return `SRB rejected the invoice (resCode ${body.resCode || "?"}).`;
}

function parseSrbResponse(httpStatus, body = {}) {
  const resCode = body.resCode != null ? String(body.resCode) : null;
  const srbInvoiceId = body.srbInvoiceId ? String(body.srbInvoiceId) : null;
  const qrCodeLink =
    body.QRCodeLink ||
    body.qrCodeLink ||
    (srbInvoiceId ? `${VERIFY_BASE}${srbInvoiceId}` : null);
  const valid =
    httpStatus === 200 && resCode === "00" && Boolean(srbInvoiceId);

  const errors = [];
  if (!valid) {
    errors.push(classifySrbError(body, httpStatus));
  }

  return {
    ok: valid,
    status: valid ? "Submitted" : "Failed",
    resCode,
    srbInvoiceId,
    qrCodeLink,
    dated: body.dated || null,
    errors,
    raw: body,
    httpStatus,
  };
}

/**
 * Submit a completed order to SRB. Never throws for business rejections —
 * returns a structured result the caller persists on the order row.
 * Never fabricates invoice IDs.
 */
async function submitOrderToSrb(order) {
  const config = await loadSrbConfig();
  if (!config.srbEnabled) {
    return {
      ok: false,
      skipped: true,
      status: "Skipped",
      errors: ["SRB integration is disabled."],
    };
  }

  const businessSettings = await readSettings("business");
  const business = businessSettings.value || {};
  const built = buildPayload(order, config, business);
  const { payload, errors, endpoint } = built;

  if (errors.length) {
    return {
      ok: false,
      status: "Failed",
      errors,
      endpoint,
      payloadPreview: {
        ...payload,
        posPass: payload.posPass ? SECRET_MASK : undefined,
      },
    };
  }

  try {
    const { httpStatus, body } = await postToSrb(endpoint, payload);
    return {
      ...parseSrbResponse(httpStatus, body),
      endpoint,
      payloadPreview: {
        ...payload,
        posPass: payload.posPass ? SECRET_MASK : undefined,
      },
    };
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? "SRB request timed out."
        : error?.message || "Could not reach SRB.";
    return {
      ok: false,
      status: "Failed",
      errors: [message],
      httpStatus: 0,
      endpoint,
      raw: { error: message },
    };
  }
}

async function testSrbConnection() {
  const config = await loadSrbConfig();
  const missing = [];
  if (!config.srbPosId) missing.push("POS ID");
  if (config.srbMode === "cloud") {
    if (!config.srbPosUser) missing.push("pos_user");
    if (!config.srbPosPass) missing.push("pos_pass");
  }
  if (!resolveEndpoint(config)) missing.push("API URL");
  if (missing.length) {
    return {
      ok: false,
      message: `Missing credentials: ${missing.join(", ")}.`,
    };
  }

  const businessSettings = await readSettings("business");
  const business = businessSettings.value || {};
  const ntn = sanitizeNtn(business.taxNumber || config.srbNtn || "");
  if (!ntn) {
    return {
      ok: false,
      message:
        "Registered NTN is required before testing. Set Business Settings → Tax number or Integrations → Registered NTN.",
    };
  }

  const probeOrder = {
    id: 0,
    orderNumber: `TEST-${Date.now().toString().slice(-8)}`,
    createdAt: new Date().toISOString(),
    subtotal: 100,
    discountAmount: 0,
    taxRate: config.srbTaxRate || 15,
    paymentMethod: "Cash",
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
  };

  // Connectivity probe always uses Test transType — never Live.
  const probeConfig = { ...config, srbTransType: "Test" };
  const built = buildPayload(probeOrder, probeConfig, {
    name: business.name || "Soft POS Test",
    taxNumber: ntn,
  });

  if (built.errors.length) {
    return { ok: false, message: built.errors.join(" "), errors: built.errors };
  }

  try {
    const { httpStatus, body } = await postToSrb(built.endpoint, built.payload);
    const parsed = parseSrbResponse(httpStatus, body);

    if (parsed.ok) {
      return {
        ok: true,
        message: `SRB accepted test invoice ${parsed.srbInvoiceId}.`,
        result: parsed,
      };
    }

    // Auth accepted but business validation failed still proves credentials work.
    if (
      httpStatus === 200 &&
      body.resCode &&
      body.resCode !== "02" &&
      !/invalid pos user/i.test(String(body.error || ""))
    ) {
      return {
        ok: true,
        message: `SRB gateway accepted credentials (resCode ${body.resCode}). ${
          parsed.errors?.[0] || ""
        }`.trim(),
        result: parsed,
      };
    }

    return {
      ok: false,
      message: parsed.errors?.join(" ") || `Unexpected SRB response (HTTP ${httpStatus}).`,
      result: parsed,
    };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || "Could not reach the SRB API.",
    };
  }
}

/**
 * On cold start, copy SRB_* env credentials into app_settings when the
 * integration profile is empty, so production can configure via Vercel env.
 */
async function bootstrapSrbFromEnv(userId = null) {
  const stored = await readSettings("integrations");
  const current = stored.value || {};
  const fromEnv = envFallback({});
  if (!fromEnv.srbPosId && !fromEnv.srbPosUser) return current;

  const next = { ...current };
  let changed = false;
  const force =
    String(process.env.SRB_FORCE_ENV || "").toLowerCase() === "true";

  const fill = (key, value) => {
    if (!value) return;
    if (force || !String(current[key] || "").trim()) {
      if (String(next[key] || "") !== String(value)) {
        next[key] = value;
        changed = true;
      }
    }
  };

  fill("srbPosId", fromEnv.srbPosId);
  fill("srbPosKey", fromEnv.srbPosKey);
  fill("srbPosUser", fromEnv.srbPosUser);
  fill("srbPosPass", fromEnv.srbPosPass);
  fill("srbApiUrl", fromEnv.srbApiUrl);
  fill("srbNtn", fromEnv.srbNtn);
  fill("srbMode", fromEnv.srbMode);
  if (fromEnv.srbEnabled && current.srbEnabled !== true) {
    next.srbEnabled = true;
    changed = true;
  }
  if (!next.srbApiUrl) {
    next.srbApiUrl =
      next.srbMode === "offline" ? DEFAULT_OFFLINE_URL : DEFAULT_CLOUD_URL;
    changed = true;
  }
  if (!next.srbTransType) {
    next.srbTransType = fromEnv.srbTransType || "Live";
    changed = true;
  }
  if (!next.srbMode) {
    next.srbMode = fromEnv.srbMode || "cloud";
    changed = true;
  }
  if (!(Number(next.srbTaxRate) > 0)) {
    next.srbTaxRate = fromEnv.srbTaxRate || 15;
    changed = true;
  }

  if (changed) await writeSettings("integrations", next, userId);
  return next;
}

module.exports = {
  SECRET_MASK,
  DEFAULT_API_URL: DEFAULT_CLOUD_URL,
  DEFAULT_CLOUD_URL,
  DEFAULT_OFFLINE_URL,
  loadSrbConfig,
  publicIntegrations,
  isMaskedSecret,
  buildPayload,
  parseSrbResponse,
  submitOrderToSrb,
  testSrbConnection,
  bootstrapSrbFromEnv,
  sanitizeNtn,
  saleValueOf,
  resolveEndpoint,
  normalizeMode,
};
