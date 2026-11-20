const jwt = require("jsonwebtoken");

function websiteSecretOk(req) {
  const secret = String(process.env.WEBSITE_ORDER_SECRET || "").trim();
  if (!secret) return false;
  const key =
    String(req.headers["x-website-key"] || "").trim() ||
    String(req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "")
      .trim();
  return Boolean(key && key === secret);
}

function requireWebsiteKey(req, res, next) {
  const secret = String(process.env.WEBSITE_ORDER_SECRET || "").trim();
  if (!secret) {
    return res.status(503).json({
      message:
        "Website order intake is not configured. Set WEBSITE_ORDER_SECRET on Soft-POS.",
    });
  }
  if (!websiteSecretOk(req)) {
    return res.status(401).json({ message: "Unauthorized website request." });
  }
  return next();
}

function optionalCustomer(req, _res, next) {
  const header = String(req.headers["x-customer-token"] || "").trim();
  if (!header) return next();
  try {
    const payload = jwt.verify(header, process.env.JWT_SECRET);
    if (payload?.type === "customer" && payload?.memberId) {
      req.customer = {
        memberId: payload.memberId,
        phone: payload.phone,
        name: payload.name || "",
      };
    }
  } catch {
    /* ignore invalid customer tokens on optional path */
  }
  return next();
}

function requireCustomer(req, res, next) {
  const header = String(req.headers["x-customer-token"] || "").trim();
  if (!header) {
    return res.status(401).json({ message: "Please verify your mobile number." });
  }
  try {
    const payload = jwt.verify(header, process.env.JWT_SECRET);
    if (payload?.type !== "customer" || !payload?.memberId) {
      return res.status(401).json({ message: "Invalid customer session." });
    }
    req.customer = {
      memberId: payload.memberId,
      phone: payload.phone,
      name: payload.name || "",
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Customer session expired. Verify again." });
  }
}

module.exports = {
  websiteSecretOk,
  requireWebsiteKey,
  optionalCustomer,
  requireCustomer,
};
