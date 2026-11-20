const path = require("path");
const backendPath = path.join(__dirname, "..", "backend");
const { Client } = require(path.join(backendPath, "node_modules", "pg"));
require(path.join(backendPath, "node_modules", "dotenv")).config({
  path: path.join(backendPath, ".env"),
});

const DESCRIPTIONS = {
  "Classic Matcha": "Clean energy without the chaos.",
  "Mango Matcha": "Tropical vacation meets matcha energy.",
  "Oreo Matcha": "Matcha took a snack break.",
  "Strawberry Matcha": "Pretty, pink, and impossible to ignore.",
};

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let fixed = 0;
  for (const [base, description] of Object.entries(DESCRIPTIONS)) {
    const result = await client.query(
      `UPDATE products
          SET description = $1, updated_at = now()
        WHERE (lower(name) = lower($2) OR lower(name) LIKE lower($3))
          AND (description IS NULL OR trim(description) = '' OR lower(trim(description)) = 'n/a')`,
      [description, base, `${base} - %`]
    );
    fixed += result.rowCount;
  }

  console.log(JSON.stringify({ fixed }, null, 2));
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
