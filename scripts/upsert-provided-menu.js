/**
 * Upsert the provided Amoons menu into Soft-POS (categories + products).
 * - Creates missing categories/products
 * - Does not overwrite correct prices/descriptions/images already present
 * - Fills blank description/image when missing
 * - Fixes known wrong category assignments (e.g. Steak Sandwich)
 * - Parent variable items (price null) are stored as unavailable catalog parents
 */
const path = require("path");
const backendPath = path.join(__dirname, "..", "backend");
const { Client } = require(path.join(backendPath, "node_modules", "pg"));
require(path.join(backendPath, "node_modules", "dotenv")).config({
  path: path.join(backendPath, ".env"),
});

const MILK_OPTIONS = [
  { suffix: "Regular milk", prices: { classic: 830, mango: 960, oreo: 860, strawberry: 1030 } },
  { suffix: "Skim milk", prices: { classic: 880, mango: 1010, oreo: 910, strawberry: 1080 } },
  { suffix: "Lactose free milk", prices: { classic: 880, mango: 1010, oreo: 910, strawberry: 1080 } },
  { suffix: "Almond milk", prices: { classic: 980, mango: 1110, oreo: 1010, strawberry: 1180 } },
  { suffix: "Coconut milk", prices: { classic: 980, mango: 1110, oreo: 1010, strawberry: 1180 } },
];

const MATCHA_BASE = [
  {
    key: "classic",
    name: "Classic Matcha",
    description: "Clean energy without the chaos.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-119.png",
  },
  {
    key: "mango",
    name: "Mango Matcha",
    description: "Tropical vacation meets matcha energy.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-125.png",
  },
  {
    key: "oreo",
    name: "Oreo Matcha",
    description: "Matcha took a snack break.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-137.png",
  },
  {
    key: "strawberry",
    name: "Strawberry Matcha",
    description: "Pretty, pink, and impossible to ignore.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-153.png",
  },
];

const MENU = [
  // Desserts
  {
    category: "Desserts",
    name: "Tiramisu (160g slice)",
    price: null,
    description:
      "A single-serving slice of our signature tiramisu — espresso-soaked ladyfingers, velvety mascarpone cream, finished with a dusting of cocoa. 160g · single serving",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-12.png",
  },
  {
    category: "Desserts",
    name: "Tiramisu (160g slice) - 2 Layers",
    price: 1150,
    description:
      "A single-serving slice of our signature tiramisu — espresso-soaked ladyfingers, velvety mascarpone cream, finished with a dusting of cocoa. 160g · single serving",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-12.png",
  },
  {
    category: "Desserts",
    name: "Tiramisu (160g slice) - 3 Layers",
    price: 1590,
    description:
      "A single-serving slice of our signature tiramisu — espresso-soaked ladyfingers, velvety mascarpone cream, finished with a dusting of cocoa. 160g · single serving",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-12.png",
  },
  {
    category: "Desserts",
    name: "Tiramisu Grande (1 lb, serves 4-5)",
    price: 3250,
    description:
      "The full cake. Layers of espresso-soaked ladyfingers and mascarpone cream, generously dusted with cocoa. Made to share. 1 pound · serves 4",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-15.png",
  },
  {
    category: "Desserts",
    name: "French Toast",
    price: 1150,
    description: "Brioche French toast, filled with Kinder, Lotus or Nutella.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-212.png",
  },
  {
    category: "Desserts",
    name: "Waffles",
    price: 1150,
    description:
      "Chocolate or Lotus waffles, served with fresh fruit, ice cream and maple syrup.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-243.png",
  },
  {
    category: "Desserts",
    name: "London Cake",
    price: 980,
    description:
      "Chocolate sponge layered with dark chocolate ganache, salted caramel and chocolate crunch, under a glossy chocolate coat.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-252.png",
  },
  {
    category: "Desserts",
    name: "Gooey Cup",
    price: 850,
    description: "",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-282.png",
  },
  {
    category: "Desserts",
    name: "Umm Ali",
    price: 880,
    description: "Warm, creamy, flaky and loaded with nuts",
    image:
      "https://amoonscafe.com/wp-content/uploads/2026/10/ChatGPT-Image-Sep-19-2026-at-09_11_21-PM.png",
  },
  {
    category: "Desserts",
    name: "Pancakes",
    price: 950,
    description: "Fluffy pancakes with your pick of Oreo, chocolate or Lotus.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-264.png",
  },

  // Iced Tea
  {
    category: "Iced Tea",
    name: "Lemon Iced Tea",
    price: 580,
    description: "Crisp, citrusy, and forever refreshing.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-94.png",
  },
  {
    category: "Iced Tea",
    name: "Passion Fruit Iced Tea",
    price: 580,
    description: "Bright, tropical, and impossible to ignore.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/pasion-iced-tea.png",
  },
  {
    category: "Iced Tea",
    name: "Peach Iced Tea",
    price: 580,
    description: "Summer in a glass.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-96.png",
  },

  // Pasta
  {
    category: "Pasta",
    name: "AMOONS Signature Pasta",
    price: 1650,
    description: "Chicken in our creamy signature pesto sauce. The one people come back for.",
    image:
      "https://amoonscafe.com/wp-content/uploads/2026/10/ChatGPT-Image-Sep-22-2026-at-12_09_37-AM.png",
  },
  {
    category: "Pasta",
    name: "Alfredo Pasta",
    price: 1100,
    description: "Creamy, cheesy, and comfort in every bite.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-98.png",
  },
  {
    category: "Pasta",
    name: "Fettuccine Honey Chili Pasta",
    price: 1350,
    description:
      "Creamy fettuccine with grilled chicken, coated in a bold honey chili sauce for the perfect sweet-heat balance.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-112.png",
  },

  // Sandwiches & Croissants
  {
    category: "Sandwiches & Croissants",
    name: "BLT Croissant",
    price: 1450,
    description:
      "Layers of buttery, crispy perfection with bologna, fresh lettuce, and ripe tomato.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-99.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Chicken Fajita Croissant",
    price: 1450,
    description: "A croissant that decided being delicious wasn't enough.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-104.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Club Sandwich",
    price: 1200,
    description: "Triple layered sandwich with creamy sauces.",
    image:
      "https://amoonscafe.com/wp-content/uploads/2026/10/ChatGPT-Image-Sep-19-2026-at-01_10_50-AM.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Butter Croissant",
    price: 600,
    description: "All butter, all flake, no distractions.",
    image:
      "https://amoonscafe.com/wp-content/uploads/2026/10/ChatGPT-Image-Sep-19-2026-at-01_04_12-AM.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Pesto Chicken Sandwich",
    price: 1299,
    description: "Fresh, herby, and main-character energy.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-114.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Roasted Beef Sandwich",
    price: 1550,
    description:
      "Roasted beef topped with sautéed mushrooms & cheese, served on toasted bran bread.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-116.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Steak Sandwich",
    price: 1550,
    description: "Big flavor, no small talk.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-117.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Za'atar Cheese Sandwich",
    price: 1099,
    description: "Middle Eastern comfort food with elite taste.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-117.png",
  },
  {
    category: "Sandwiches & Croissants",
    name: "Smashed Beef Croissant",
    price: 1599,
    description: "A little messy, very extra, and worth every crumb.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-301.png",
  },

  // Appetizers & Fries
  {
    category: "Appetizers & Fries",
    name: "Beef Loaded Fries",
    price: 1199,
    description: "Crispy fries loaded with beef, cheese, and signature sauces.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-100.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Chicken Loaded Fries",
    price: 1099,
    description: "Crispy fries loaded with chicken, cheese, and signature sauces.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-105.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Chilli Honey Glazed Chicken Strips",
    price: 1250,
    description: "Sweet heat with a crispy edge. Dangerously easy to finish.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-106.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Chipotle Fries",
    price: 900,
    description: "Smoky, creamy, and mildly addictive.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/chipotle.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Crispy Fried Chicken Strips",
    price: 1150,
    description: "Golden, crunchy, and impossible to share.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-109.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Dynamite Chicken",
    price: 899,
    description: "Crunchy on the outside, spicy on the inside.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-111.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Mozzarella Cheese Sticks",
    price: 1050,
    description: "Cheese pulls worthy of Instagram.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/mozrella-cheese-strips.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Plain Fries",
    price: 690,
    description: "No drama. Just perfectly crispy fries.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-115.png",
  },
  {
    category: "Appetizers & Fries",
    name: "Cajun Fries",
    price: 700,
    description:
      "Crispy golden fries tossed in bold Cajun seasoning for the perfect spicy, smoky kick.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-303.png",
  },

  // Classic Mocktails
  {
    category: "Classic Mocktails",
    name: "Electric Blue",
    price: 550,
    description: "It looks dramatic because it is.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-171.png",
  },
  {
    category: "Classic Mocktails",
    name: "Passion Punch",
    price: 650,
    description: "Tropical energy with main-character vibes.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-189.png",
  },
  {
    category: "Classic Mocktails",
    name: "Poms (Pomegranate)",
    price: 550,
    description: "Pomegranate doing the absolute most.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-196.png",
  },

  // Signature Mocktails
  {
    category: "Signature Mocktails",
    name: "Mango Tabasco",
    price: 860,
    description: "Sweet mango with a chilli kick. Bold and slightly unhinged.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-179.png",
  },
  {
    category: "Signature Mocktails",
    name: "Marmalade Blueberry",
    price: 860,
    description: "Citrusy, juicy, and a little fancy.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-181.png",
  },
  {
    category: "Signature Mocktails",
    name: "Peach Vanilla Basil",
    price: 830,
    description: "Fresh, aromatic, and effortlessly cool.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-194.png",
  },
  {
    category: "Signature Mocktails",
    name: "Strawberry Pepper",
    price: 830,
    description: "Sweet with a little spice.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-197.png",
  },

  // Frappes
  {
    category: "Frappes",
    name: "Lotus Frappé",
    price: 1030,
    description: "Biscoff lovers, this one's for you.",
    image:
      "https://amoonscafe.com/wp-content/uploads/2026/10/ChatGPT-Image-Sep-21-2026-at-09_24_35-PM.png",
  },
  {
    category: "Frappes",
    name: "Caramel Frappé",
    price: 780,
    description: "Dessert disguised as a drink.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-209.png",
  },
  {
    category: "Frappes",
    name: "Vanilla Frappé",
    price: 780,
    description: "Creamy, icy, and impossible to dislike.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-210.png",
  },
  {
    category: "Frappes",
    name: "Mocha Frappé",
    price: 800,
    description: "Coffee and chocolate, name a better duo.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-211.png",
  },
  {
    category: "Frappes",
    name: "Kinder Bueno Frappé",
    price: 1100,
    description: "Childhood memories blended to perfection.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-218.png",
  },
  {
    category: "Frappes",
    name: "Pistachio Frappé",
    price: 1050,
    description: "Rich, creamy, and extra in the best way.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-219.png",
  },
  {
    category: "Frappes",
    name: "Hazelnut Frappé",
    price: 780,
    description: "Nutty comfort in frozen form.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-227.png",
  },

  // Bottled Drinks
  {
    category: "Bottled Drinks",
    name: "Water",
    price: 80,
    description: "Still water. Sometimes that's the whole order.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/water-review.jpg",
  },

  // Breakfast
  {
    category: "Breakfast",
    name: "Steak Cheese Omelet",
    price: 1620,
    description:
      "Beef, cheese and bell peppers stuffed into a fluffy omelet, served with fresh salad, curly fries, butter, jam and bread.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-253.png",
  },
  {
    category: "Breakfast",
    name: "Scrambled Egg Croissant",
    price: 1399,
    description:
      "Fluffy scrambled eggs in a croissant, served with Greek tomato, fresh salad, turkey bacon, butter, jam and bread.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-254.png",
  },
  {
    category: "Breakfast",
    name: "Mexican Egg Croissant",
    price: 1420,
    description:
      "Cheesy Mexican-style scrambled eggs with colourful bell peppers in a croissant, served with fresh salad, bologna, Greek tomato, butter, jam and bread.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-262.png",
  },
  {
    category: "Breakfast",
    name: "Pakistani Omelet",
    price: 1050,
    description:
      "Fluffy omelet with onion, tomato, coriander and green chilli, served with fresh salad, curly fries, butter, jam and bread.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-263.png",
  },
  {
    category: "Breakfast",
    name: "Pancakes",
    price: 950,
    description: "Fluffy pancakes with your pick of Oreo, chocolate or Lotus.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-264.png",
  },
  {
    category: "Breakfast",
    name: "Shakshuka",
    price: 1250,
    description: "Poached eggs in a rich, spiced tomato sauce with herbs & peppers.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-271.png",
  },
  {
    category: "Breakfast",
    name: "Lahsa Egg",
    price: 1150,
    description: "Spicy Lahsa-style eggs, served with butter, jam and bread.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-272.png",
  },
  {
    category: "Breakfast",
    name: "Mushroom Cheese Omelet",
    price: 1299,
    description:
      "Fluffy omelet with sauteed mushrooms and melted cheese, served with fresh salad, curly fries, butter, jam and bread.",
    image: "https://amoonscafe.com/wp-content/uploads/2026/10/amoons-product-273.png",
  },
];

// Pancakes appears in Breakfast and Desserts — keep one product under Breakfast,
// and also ensure a Desserts listing via a distinct sellable name only if needed.
// Soft-POS enforces unique product names, so Breakfast owns "Pancakes".
// Desserts already has "Pancakes" in MENU above — remove duplicate breakfast entry conflict:
// Keep Desserts Pancakes AND Breakfast Pancakes can't both exist by unique name.
// Prefer Breakfast as primary category for Pancakes (user listed Breakfast first).
for (let i = MENU.length - 1; i >= 0; i -= 1) {
  if (MENU[i].name === "Pancakes" && MENU[i].category === "Desserts") {
    MENU.splice(i, 1);
  }
}

for (const base of MATCHA_BASE) {
  MENU.push({
    category: "Matcha",
    name: base.name,
    price: null,
    description: base.description,
    image: base.image,
  });
  for (const milk of MILK_OPTIONS) {
    MENU.push({
      category: "Matcha",
      name: `${base.name} - ${milk.suffix}`,
      price: milk.prices[base.key],
      description: base.description,
      image: base.image,
    });
  }
}

const CATEGORY_ORDER = [
  "Breakfast",
  "Appetizers & Fries",
  "Sandwiches & Croissants",
  "Pasta",
  "Desserts",
  "Iced Tea",
  "Matcha",
  "Classic Mocktails",
  "Signature Mocktails",
  "Frappes",
  "Bottled Drinks",
];

async function ensureCategory(client, name, sortOrder) {
  const existing = await client.query(
    "SELECT id, name FROM categories WHERE lower(name) = lower($1) LIMIT 1",
    [name]
  );
  if (existing.rowCount) {
    await client.query(
      "UPDATE categories SET sort_order = $1, is_active = true, updated_at = now() WHERE id = $2",
      [sortOrder, existing.rows[0].id]
    );
    return existing.rows[0].id;
  }
  const created = await client.query(
    `INSERT INTO categories (name, sort_order, is_active)
     VALUES ($1, $2, true)
     RETURNING id`,
    [name, sortOrder]
  );
  return created.rows[0].id;
}

function blank(value) {
  return value == null || String(value).trim() === "";
}

async function upsertProduct(client, item, categoryId) {
  const isParent = item.price == null;
  const price = isParent ? 0 : Number(item.price);
  const available = !isParent;

  const found = await client.query(
    "SELECT id, name, price, description, image_url, category_id, is_available FROM products WHERE lower(name) = lower($1) LIMIT 1",
    [item.name]
  );

  if (!found.rowCount) {
    await client.query(
      `INSERT INTO products
         (category_id, name, description, price, image_url, is_available, track_stock, unit)
       VALUES ($1, $2, $3, $4, $5, $6, false, 'pcs')`,
      [
        categoryId,
        item.name,
        item.description || null,
        price,
        item.image || null,
        available,
      ]
    );
    return "created";
  }

  const row = found.rows[0];
  const nextDescription = blank(row.description) && item.description ? item.description : row.description;
  const nextImage = blank(row.image_url) && item.image ? item.image : row.image_url;
  const nextCategoryId = categoryId; // always correct category for provided items
  const nextPrice = isParent ? 0 : Number(row.price) > 0 ? Number(row.price) : price;
  const nextAvailable = isParent ? false : row.is_available !== false;

  await client.query(
    `UPDATE products
        SET category_id = $1,
            description = $2,
            price = $3,
            image_url = $4,
            is_available = $5,
            updated_at = now()
      WHERE id = $6`,
    [nextCategoryId, nextDescription, nextPrice, nextImage, nextAvailable, row.id]
  );

  return "updated";
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const stats = { created: 0, updated: 0, categories: 0 };

  try {
    await client.query("BEGIN");

    const categoryIds = new Map();
    for (let i = 0; i < CATEGORY_ORDER.length; i += 1) {
      const name = CATEGORY_ORDER[i];
      const id = await ensureCategory(client, name, (i + 1) * 10);
      categoryIds.set(name.toLowerCase(), id);
      stats.categories += 1;
    }

    // Deduplicate by name (last wins for category preference already handled)
    const byName = new Map();
    for (const item of MENU) byName.set(item.name.toLowerCase(), item);

    for (const item of byName.values()) {
      const categoryId = categoryIds.get(item.category.toLowerCase());
      if (!categoryId) throw new Error(`Missing category ${item.category}`);
      const result = await upsertProduct(client, item, categoryId);
      stats[result] += 1;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        categoriesEnsured: stats.categories,
        productsCreated: stats.created,
        productsUpdated: stats.updated,
        menuRows: MENU.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("UPSERT_FAILED", error.message);
  process.exit(1);
});
