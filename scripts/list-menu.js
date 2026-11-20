const path = require("path");
const backendPath = path.join(__dirname, "..", "backend");
const { Client } = require(path.join(backendPath, "node_modules", "pg"));
require(path.join(backendPath, "node_modules", "dotenv")).config({
  path: path.join(backendPath, ".env"),
});

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const cats = await client.query(
    "SELECT id, name, sort_order FROM categories ORDER BY sort_order, name"
  );
  const prods = await client.query(`
    SELECT p.id, p.name, p.price,
           (p.image_url IS NOT NULL AND p.image_url <> '') AS has_img,
           length(coalesce(p.description, '')) AS desc_len,
           c.name AS category
      FROM products p
      JOIN categories c ON c.id = p.category_id
     ORDER BY c.name, p.name
  `);

  console.log("CATEGORIES", cats.rows.length);
  console.log(cats.rows.map((r) => r.name).join(" | "));
  console.log("PRODUCTS", prods.rows.length);
  for (const p of prods.rows) {
    console.log(
      [p.category, p.name, p.price, p.has_img ? "img" : "noimg", p.desc_len].join("\t")
    );
  }

  await client.end();
}

main().catch((error) => {
  console.error("ERR", error.message);
  process.exit(1);
});
