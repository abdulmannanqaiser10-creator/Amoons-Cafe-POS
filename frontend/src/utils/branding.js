/** Vendor / platform branding (Lexcore Solutions). */

export const LEXCORE = {
  name: "Lexcore Solutions",
  displayName: "Lexcore Solutions",
  phone: "+923202100438",
  email: "lexcoresolutions@gmail.com",
  url: "https://lexcoresolutions.com",
  tagline: "Intelligent Digital Solutions",
  logoSrc: "/lexcore-logo.svg",
};

/** On-screen brand label — Lexcore Solutions only (no “Powered by”). */
export const BRAND_LABEL = LEXCORE.name;

/** Receipt / print footer line. */
export const PRINT_VENDOR_LINE = `${LEXCORE.name} | ${LEXCORE.phone} | ${LEXCORE.email}`;

/** @deprecated Use BRAND_LABEL — kept for older imports. */
export const POWERED_BY_LABEL = LEXCORE.name;

/** @deprecated Use PRINT_VENDOR_LINE. */
export const POWERED_BY_PRINT = PRINT_VENDOR_LINE;

export const APP_BRAND = {
  name: LEXCORE.name,
  tagline: LEXCORE.tagline,
};

/** Full SRB invoice verification URL used for QR encoding. */
export function srbVerificationUrl(order) {
  if (!order) return "";
  const link = String(order.srbQrLink || "").trim();
  if (link) return link;
  const invoiceId = String(order.srbInvoiceId || "").trim();
  if (!invoiceId) return "";
  return `https://apps.srb.gos.pk/InvoiceVerification/MobileInvoiceStatus.jsp?invoiceVerification=${encodeURIComponent(invoiceId)}`;
}
