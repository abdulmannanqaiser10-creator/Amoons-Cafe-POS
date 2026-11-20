require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { ensureSchema } = require("../config/schema");
const { testSrbConnection, loadSrbConfig } = require("../services/srbService");

async function main() {
  await ensureSchema();
  const config = await loadSrbConfig();
  console.log("SRB config:", {
    enabled: config.srbEnabled,
    mode: config.srbMode,
    posId: config.srbPosId,
    posUser: config.srbPosUser,
    apiUrl: config.srbApiUrl,
    transType: config.srbTransType,
    taxRate: config.srbTaxRate,
    hasPass: Boolean(config.srbPosPass),
    hasNtn: Boolean(config.srbNtn),
  });

  const result = await testSrbConnection();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
