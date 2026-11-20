/**
 * Upserts website menu items into Soft-POS products so checkout name-matching works.
 */
const { Client } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const WEBSITE_ITEMS = [
  { name: "Amoons Tiramisu", category: "Desserts", price: 1450 },
  { name: "Flat White", category: "Coffee", price: 850 },
  { name: "Cinnamon Roll", category: "Bakery", price: 780 },
  { name: "Pour Over", category: "Coffee", price: 950 },
  { name: "Pistachio Slice", category: "Desserts", price: 1250 },
  { name: "Butter Croissant", category: "Bakery", price: 650 },
  { name: "Shakshuka Bowl", category: "Savoury", price: 1650 },
  { name: "Affogato", category: "Coffee", price: 1100 },
];

async function ensureCategory(client, name) {
  const existing = await client.query(
    "SELECT id FROM categories WHERE lower(name) = lower($1) LIMIT 1",
    [name]
  );
  if (existing.rowCount) return existing.rows[0].id;
  const created = await client.query(
    "INSERT INTO categories (name) VALUES ($1) RETURNING id",
    [name]
  );
  return created.rows[0].id;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query("BEGIN");
    for (const item of WEBSITE_ITEMS) {
      const categoryId = await ensureCategory(client, item.category);
      const found = await client.query(
        "SELECT id FROM products WHERE lower(name) = lower($1) LIMIT 1",
        [item.name]
      );
      if (found.rowCount) {
        await client.query(
          `UPDATE products
              SET price = $1, category_id = $2, is_available = true, updated_at = now()
            WHERE id = $3`,
          [item.price, categoryId, found.rows[0].id]
        );
        console.log(`updated ${item.name}`);
      } else {
        await client.query(
          `INSERT INTO products (name, price, category_id, is_available, track_stock)
           VALUES ($1, $2, $3, true, false)`,
          [item.name, item.price, categoryId]
        );
        console.log(`created ${item.name}`);
      }
    }

    await client.query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('tax', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE
         SET value = CASE
               WHEN COALESCE((app_settings.value->>'enabled')::boolean, false) = true
                    AND COALESCE((app_settings.value->>'rate')::numeric, 0) > 0
               THEN app_settings.value
               ELSE EXCLUDED.value
             END,
             updated_at = now()`,
      [JSON.stringify({ enabled: true, rate: 16, label: "Sales tax", inclusive: false })]
    );

    await client.query("COMMIT");
    const products = await client.query(
      "SELECT id, name, price FROM products ORDER BY name"
    );
    console.log(JSON.stringify(products.rows, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
