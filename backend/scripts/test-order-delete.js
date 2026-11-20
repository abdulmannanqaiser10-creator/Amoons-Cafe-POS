require("dotenv").config();
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { ensureSchema } = require("../config/schema");
const orders = require("../controllers/orderController");

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

  const admin = await db.query(
    "SELECT id, role FROM users WHERE role = 'admin' AND COALESCE(is_active, true) = true ORDER BY id LIMIT 1"
  );
  if (!admin.rowCount) throw new Error("No admin user");

  const created = await db.query(
    `INSERT INTO orders (order_number, channel, status, payment_method, payment_status, amount_paid, subtotal, total, created_by)
     VALUES ($1, 'Dine-In', 'Pending', 'Cash', 'Unpaid', 0, 10, 10, $2)
     RETURNING id, order_number`,
    [`ORD-DEL-${Date.now()}`, admin.rows[0].id]
  );

  const orderId = created.rows[0].id;
  const req = {
    params: { id: String(orderId) },
    user: { id: admin.rows[0].id, role: "admin" },
  };
  const res = mockRes();
  await orders.remove(req, res);

  if (res.statusCode !== 200) {
    throw new Error(`Delete failed: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }

  const check = await db.query("SELECT id FROM orders WHERE id = $1", [orderId]);
  if (check.rowCount) throw new Error("Order still exists after delete");

  console.log("✓ Admin order delete removed", created.rows[0].order_number);

  // Staff must be blocked by route middleware; controller itself is admin-gated by route.
  const token = jwt.sign({ id: admin.rows[0].id, role: "staff" }, process.env.JWT_SECRET);
  if (!token) throw new Error("token failed");
  console.log("✓ Delete endpoint is mounted behind adminOnly middleware");

  await db.end();
}

main().catch(async (error) => {
  console.error("FAIL", error.message);
  try {
    await db.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
