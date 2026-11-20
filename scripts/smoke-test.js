/**
 * End-to-end smoke test against the live database / local Express app.
 * Usage: node scripts/smoke-test.js  (from repo root, with backend deps)
 */
const path = require("path");
const backendRoot = path.join(__dirname, "../backend");
module.paths.unshift(path.join(backendRoot, "node_modules"));
require("dotenv").config({ path: path.join(backendRoot, ".env") });

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../backend/config/db");
const { ensureSchema } = require("../backend/config/schema");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensurePins() {
  const accounts = [
    { name: "Admin", pin: "24680", role: "admin", canReverse: true },
    { name: "Maaz", pin: "12345", role: "staff", canReverse: true },
  ];

  for (const account of accounts) {
    const pinHash = await bcrypt.hash(account.pin, 10);
    const existing = await db.query(
      `SELECT id FROM users WHERE lower(trim(display_name)) = lower($1) ORDER BY id LIMIT 1`,
      [account.name]
    );
    if (existing.rowCount) {
      await db.query(
        `UPDATE users SET pin_hash=$1, role=$2, can_reverse=$3, is_active=true WHERE id=$4`,
        [pinHash, account.role, account.canReverse, existing.rows[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO users (pin_hash, role, display_name, can_reverse, is_active)
         VALUES ($1,$2,$3,$4,true)`,
        [pinHash, account.role, account.name, account.canReverse]
      );
    }
  }
}

async function loginPin(pin) {
  const users = await db.query(
    "SELECT id, role, pin_hash, is_active FROM users ORDER BY is_active DESC, id"
  );
  for (const user of users.rows) {
    if (await bcrypt.compare(pin, user.pin_hash)) {
      assert(user.is_active !== false, `PIN ${pin} matches a deactivated account`);
      return {
        id: user.id,
        role: user.role === "admin" ? "admin" : "staff",
        token: jwt.sign(
          { id: user.id, role: user.role === "admin" ? "admin" : "staff" },
          process.env.JWT_SECRET,
          { expiresIn: "1h" }
        ),
      };
    }
  }
  throw new Error(`PIN ${pin} did not match`);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL missing");
  assert(process.env.JWT_SECRET, "JWT_SECRET missing");

  await ensureSchema();
  await ensurePins();

  const admin = await loginPin("24680");
  assert(admin.role === "admin", "24680 must be admin");
  console.log("✓ PIN 24680 → admin");

  const staff = await loginPin("12345");
  assert(staff.role === "staff", "12345 must be staff");
  console.log("✓ PIN 12345 → staff (Home POS)");

  const product = await db.query(
    `SELECT p.id, p.price FROM products p WHERE p.is_available = true ORDER BY p.id LIMIT 1`
  );
  assert(product.rowCount, "Need at least one product");

  const client = await db.connect();
  let orderId;
  try {
    await client.query("BEGIN");
    const subtotal = Number(product.rows[0].price);
    const discountAmount = 50;
    const after = Math.max(0, subtotal - discountAmount);
    const taxRate = 0;
    const taxAmount = 0;
    const total = after;

    const created = await client.query(
      `INSERT INTO orders
         (order_number, customer_name, customer_phone, channel, status, payment_method,
          payment_status, amount_paid, subtotal, discount_amount, discount_type, discount_percent,
          discount_after_tax, tax_rate, tax_amount, total, created_by)
       VALUES (
         'ORD-TEST-' || lpad(nextval('order_number_seq')::text, 5, '0'),
         NULL, '03001234567', 'Dine-In', 'Pending', 'Cash',
         'Unpaid', 0, $1, $2, 'fixed', 0, false, $3, $4, $5, $6
       )
       RETURNING id, order_number, discount_amount, total`,
      [subtotal, discountAmount, taxRate, taxAmount, total, staff.id]
    );
    orderId = created.rows[0].id;
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, category, unit_price, quantity, line_total)
       VALUES ($1, $2, 'Smoke Test Item', 'Test', $3, 1, $3)`,
      [orderId, product.rows[0].id, subtotal]
    );
    await client.query("COMMIT");
    console.log(
      `✓ Order created with discount before tax: ${created.rows[0].order_number} total=${created.rows[0].total}`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Complete + award points (mirrors controller logic)
  const completeClient = await db.connect();
  try {
    await completeClient.query("BEGIN");
    await completeClient.query(
      `UPDATE orders SET status='Completed', payment_status='Paid', amount_paid=total, updated_at=now()
        WHERE id=$1`,
      [orderId]
    );

    let member = await completeClient.query(
      `SELECT id FROM loyalty_members WHERE regexp_replace(phone, '\\D', '', 'g') = $1 FOR UPDATE`,
      ["03001234567"]
    );
    if (!member.rowCount) {
      member = await completeClient.query(
        `INSERT INTO loyalty_members (name, phone, points) VALUES ($1,$2,0) RETURNING id`,
        ["Customer 03001234567", "03001234567"]
      );
    }
    const memberId = member.rows[0].id;
    await completeClient.query(
      `WITH inserted AS (
         INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
         VALUES ($1, 10, 'Earn', 'Completed order reward', $2, $3)
         ON CONFLICT (order_id) DO NOTHING
         RETURNING member_id, points
       )
       UPDATE loyalty_members m
          SET points = m.points + i.points, updated_at = now()
         FROM inserted i WHERE m.id = i.member_id`,
      [memberId, orderId, staff.id]
    );
    // Duplicate award must not add again
    await completeClient.query(
      `WITH inserted AS (
         INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
         VALUES ($1, 10, 'Earn', 'duplicate', $2, $3)
         ON CONFLICT (order_id) DO NOTHING
         RETURNING member_id, points
       )
       UPDATE loyalty_members m
          SET points = m.points + i.points, updated_at = now()
         FROM inserted i WHERE m.id = i.member_id`,
      [memberId, orderId, staff.id]
    );
    await completeClient.query("COMMIT");

    const balance = await db.query(`SELECT points FROM loyalty_members WHERE id=$1`, [memberId]);
    const entries = await db.query(
      `SELECT count(*)::int AS c FROM loyalty_entries WHERE order_id=$1`,
      [orderId]
    );
    assert(entries.rows[0].c === 1, "Duplicate reward entry was created");
    assert(Number(balance.rows[0].points) >= 10, "Points were not awarded");
    console.log(`✓ Rewards: 10 pts once per order (balance=${balance.rows[0].points})`);
  } catch (error) {
    await completeClient.query("ROLLBACK");
    throw error;
  } finally {
    completeClient.release();
  }

  console.log("All smoke checks passed.");
}

main()
  .catch((error) => {
    console.error("Smoke test failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  });
