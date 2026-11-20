/**
 * Seeds SRB production credentials into app_settings.integrations.
 * Safe to re-run — merges over existing integration settings.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { ensureSchema } = require("../config/schema");
const { readSettings, writeSettings } = require("../controllers/settingsStore");

async function main() {
  await ensureSchema();
  const current = await readSettings("integrations");
  const next = {
    ...(current.value || {}),
    srbEnabled: true,
    srbMode: process.env.SRB_MODE || "cloud",
    srbPosId: process.env.SRB_POS_ID || "2909",
    srbPosKey: process.env.SRB_POS_KEY || "J025C",
    srbPosUser: process.env.SRB_POS_USER || "79278836",
    srbPosPass: process.env.SRB_POS_PASS || "A48861C13626A",
    srbApiUrl:
      process.env.SRB_API_URL ||
      "https://pos.srb.gos.pk/ePOSGateway/v1/SalesInvoiceService.api",
    srbTransType: process.env.SRB_TRANS_TYPE || "Live",
    srbTaxRate: Number(process.env.SRB_TAX_RATE || 15) || 15,
    srbNtn: process.env.SRB_NTN || current.value?.srbNtn || "",
  };

  await writeSettings("integrations", next, null);
  console.log("SRB credentials saved:", {
    srbEnabled: next.srbEnabled,
    srbPosId: next.srbPosId,
    srbPosUser: next.srbPosUser,
    srbApiUrl: next.srbApiUrl,
    srbTransType: next.srbTransType,
    srbTaxRate: next.srbTaxRate,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
