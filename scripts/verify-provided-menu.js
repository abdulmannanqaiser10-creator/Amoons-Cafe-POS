const path = require("path");
const backendPath = path.join(__dirname, "..", "backend");
const { Client } = require(path.join(backendPath, "node_modules", "pg"));
require(path.join(backendPath, "node_modules", "dotenv")).config({
  path: path.join(backendPath, ".env"),
});

const expected = [
  "Tiramisu (160g slice) - 2 Layers",
  "Tiramisu (160g slice) - 3 Layers",
  "Tiramisu Grande (1 lb, serves 4-5)",
  "French Toast",
  "Waffles",
  "London Cake",
  "Gooey Cup",
  "Umm Ali",
  "Lemon Iced Tea",
  "Passion Fruit Iced Tea",
  "Peach Iced Tea",
  "AMOONS Signature Pasta",
  "Alfredo Pasta",
  "Fettuccine Honey Chili Pasta",
  "BLT Croissant",
  "Chicken Fajita Croissant",
  "Club Sandwich",
  "Butter Croissant",
  "Pesto Chicken Sandwich",
  "Roasted Beef Sandwich",
  "Steak Sandwich",
  "Za'atar Cheese Sandwich",
  "Smashed Beef Croissant",
  "Beef Loaded Fries",
  "Chicken Loaded Fries",
  "Chilli Honey Glazed Chicken Strips",
  "Chipotle Fries",
  "Crispy Fried Chicken Strips",
  "Dynamite Chicken",
  "Mozzarella Cheese Sticks",
  "Plain Fries",
  "Cajun Fries",
  "Classic Matcha - Regular milk",
  "Classic Matcha - Skim milk",
  "Classic Matcha - Lactose free milk",
  "Classic Matcha - Almond milk",
  "Classic Matcha - Coconut milk",
  "Mango Matcha - Regular milk",
  "Mango Matcha - Skim milk",
  "Mango Matcha - Lactose free milk",
  "Mango Matcha - Almond milk",
  "Mango Matcha - Coconut milk",
  "Oreo Matcha - Regular milk",
  "Oreo Matcha - Skim milk",
  "Oreo Matcha - Lactose free milk",
  "Oreo Matcha - Almond milk",
  "Oreo Matcha - Coconut milk",
  "Strawberry Matcha - Regular milk",
  "Strawberry Matcha - Skim milk",
  "Strawberry Matcha - Lactose free milk",
  "Strawberry Matcha - Almond milk",
  "Strawberry Matcha - Coconut milk",
  "Electric Blue",
  "Passion Punch",
  "Poms (Pomegranate)",
  "Mango Tabasco",
  "Marmalade Blueberry",
  "Peach Vanilla Basil",
  "Strawberry Pepper",
  "Lotus Frappé",
  "Caramel Frappé",
  "Vanilla Frappé",
  "Mocha Frappé",
  "Kinder Bueno Frappé",
  "Pistachio Frappé",
  "Hazelnut Frappé",
  "Water",
  "Steak Cheese Omelet",
  "Scrambled Egg Croissant",
  "Mexican Egg Croissant",
  "Pakistani Omelet",
  "Pancakes",
  "Shakshuka",
  "Lahsa Egg",
  "Mushroom Cheese Omelet",
];

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const rows = (
    await client.query("SELECT name, price, is_available, category_id FROM products")
  ).rows;
  const by = new Map(rows.map((r) => [r.name.toLowerCase(), r]));
  const missing = expected.filter((n) => !by.has(n.toLowerCase()));
  console.log(
    JSON.stringify(
      {
        expected: expected.length,
        present: expected.length - missing.length,
        missing,
        totalProducts: rows.length,
      },
      null,
      2
    )
  );
  await client.end();
  if (missing.length) process.exit(2);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
