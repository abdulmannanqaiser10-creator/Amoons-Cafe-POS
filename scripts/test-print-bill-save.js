/**
 * Verifies the Print Bill save path at the DB/controller level:
 * create Pending order → complete → list contains Completed/Paid once.
 */
const path = require("path");
const backendRoot = path.join(__dirname, "../backend");
module.paths.unshift(path.join(backendRoot, "node_modules"));
require("dotenv").config({ path: path.join(backendRoot, ".env") });

const db = require("../backend/config/db");
const { ensureSchema } = require("../backend/config/schema");
const orderController = require("../backend/controllers/orderController");

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function main() {
  await ensureSchema();

  const staff = await db.query(
    `SELECT id FROM users WHERE role = 'staff' AND is_active = true ORDER BY id LIMIT 1`
  );
  if (!staff.rowCount) throw new Error("No staff user");

  const product = await db.query(
    `SELECT p.id
       FROM products p
       LEFT JOIN inventory_items i ON i.product_id = p.id
      WHERE p.is_available = true
        AND (p.track_stock = false OR COALESCE(i.quantity, 0) >= 1)
      ORDER BY p.id
      LIMIT 1`
  );
  if (!product.rowCount) throw new Error("No sellable product");

  const user = {
    id: staff.rows[0].id,
    role: "staff",
  };

  const createReq = {
    user,
    body: {
      channel: "Dine-In",
      paymentMethod: "Cash",
      items: [{ productId: product.rows[0].id, quantity: 1 }],
    },
  };
  const createRes = mockRes();
  await orderController.create(createReq, createRes);
  if (createRes.statusCode >= 400) {
    throw new Error(`create failed: ${JSON.stringify(createRes.body)}`);
  }
  const order = createRes.body?.order || createRes.body;
  if (!order?.id) throw new Error("create missing order id");
  console.log(`✓ create ${order.orderNumber} → ${order.status}/${order.paymentStatus}`);

  const completeRes = mockRes();
  await orderController.complete(
    { user, params: { id: String(order.id) } },
    completeRes
  );
  if (completeRes.statusCode >= 400) {
    throw new Error(`complete failed: ${JSON.stringify(completeRes.body)}`);
  }
  const done = completeRes.body?.order || completeRes.body;
  if (done.status !== "Completed" || done.paymentStatus !== "Paid") {
    throw new Error(`expected Completed/Paid, got ${done.status}/${done.paymentStatus}`);
  }
  console.log(`✓ complete ${done.orderNumber} → Completed/Paid`);

  const listed = await db.query(
    `SELECT id, status, payment_status AS "paymentStatus"
       FROM orders WHERE id = $1`,
    [order.id]
  );
  if (!listed.rowCount) throw new Error("order missing from DB (Orders page source)");
  console.log("✓ order persisted for Orders page");

  // Idempotent second complete (no duplicate row)
  const again = mockRes();
  await orderController.complete(
    { user, params: { id: String(order.id) } },
    again
  );
  if (again.statusCode >= 400) {
    throw new Error(`second complete failed: ${JSON.stringify(again.body)}`);
  }
  const count = await db.query(`SELECT count(*)::int AS n FROM orders WHERE id = $1`, [
    order.id,
  ]);
  if (count.rows[0].n !== 1) throw new Error("duplicate order rows detected");
  console.log("✓ no duplicate order on second complete");

  // Cart identity sanity: menu ids are numeric and unique for add-to-cart keys
  const menu = await db.query(`SELECT id, name FROM products WHERE is_available = true`);
  const ids = new Set(menu.rows.map((r) => r.id));
  if (ids.size !== menu.rows.length) throw new Error("duplicate product ids");
  console.log(`✓ ${menu.rows.length} sellable products have unique ids for Current Order`);

  console.log("Print Bill save workflow OK");
  await db.end();
}

main().catch(async (error) => {
  console.error("FAIL:", error.message);
  try {
    await db.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
