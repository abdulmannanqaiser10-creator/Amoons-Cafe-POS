require("dotenv").config();
const db = require("../config/db");

async function main() {
  const tables = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1"
  );
  console.log("tables:", tables.rows.map((r) => r.tablename).join(", "));

  const cats = await db.query("SELECT id, name FROM categories ORDER BY id");
  console.log("categories:", cats.rows);

  const prods = await db.query("SELECT id, name FROM products ORDER BY id");
  console.log("products:", prods.rows);

  const dupProducts = await db.query(
    "SELECT lower(name) AS n, count(*)::int AS c FROM products GROUP BY 1 HAVING count(*) > 1"
  );
  console.log("dup product names:", dupProducts.rows);

  const dupCats = await db.query(
    "SELECT lower(name) AS n, count(*)::int AS c FROM categories GROUP BY 1 HAVING count(*) > 1"
  );
  console.log("dup category names:", dupCats.rows);

  await db.end();
}

main().catch(async (error) => {
  console.error("diagnose failed:", error.message);
  try {
    await db.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
