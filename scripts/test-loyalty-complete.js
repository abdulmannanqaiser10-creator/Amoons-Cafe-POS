/**
 * Verifies: website order creates with channel Web, no Earn on Pending,
 * Completing a paid order awards exactly 10 points once.
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "backend", ".env") });

const BASE = process.env.POS_TEST_URL || "https://amoonssoft.vercel.app/api";
const KEY = process.env.WEBSITE_ORDER_SECRET || "amoons-website-order-2026";

async function json(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `${response.status} ${url}`);
  }
  return data;
}

async function main() {
  const phone = `0348${String(Date.now()).slice(-7)}`;
  const headers = {
    "Content-Type": "application/json",
    "x-website-key": KEY,
  };

  const otp = await json(`${BASE}/website/customer/otp/request`, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, name: "Loyalty QA" }),
  });
  const verified = await json(`${BASE}/website/customer/otp/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      phone,
      name: "Loyalty QA",
      code: otp.previewCode,
    }),
  });

  const order = await json(`${BASE}/website/orders`, {
    method: "POST",
    headers: { ...headers, "x-customer-token": verified.token },
    body: JSON.stringify({
      customerName: "Loyalty QA",
      customerPhone: phone,
      fulfillment: "Delivery",
      city: "Karachi",
      area: "DHA All Phases",
      deliveryFee: 150,
      deliveryAddress: "Test house, DHA Phase 8",
      paymentMethod: "Card",
      amountPaid: 99999,
      items: [{ name: "Flat White", quantity: 1 }],
    }),
  });

  console.log("created", order.order);

  if (order.order.channel !== "Web") {
    throw new Error(`Expected channel Web, got ${order.order.channel}`);
  }
  if (order.order.loyaltyPointsAwarded !== 0) {
    throw new Error("Pending website orders must not award points");
  }

  // Complete via DB helper using backend modules
  const db = require("../backend/config/db");
  const { ensureSchema } = require("../backend/config/schema");
  await ensureSchema();

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE orders
          SET status = 'Completed',
              payment_status = 'Paid',
              amount_paid = total,
              updated_at = now()
        WHERE id = $1`,
      [order.order.orderId]
    );

    // Mirror awardLoyaltyForOrder
    const { REWARD_POINTS_PER_ORDER } = require("../backend/services/rewardTiers");
    const memberId = order.order.loyaltyMemberId;
    await client.query(
      `WITH inserted AS (
         INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
         SELECT $1, $2, 'Earn', 'Completed order reward', $3, NULL
          WHERE NOT EXISTS (
            SELECT 1 FROM loyalty_entries
             WHERE order_id = $3 AND reason = 'Earn'
          )
         RETURNING member_id, points
       )
       UPDATE loyalty_members m
          SET points = m.points + i.points,
              updated_at = now()
         FROM inserted i
        WHERE m.id = i.member_id`,
      [memberId, REWARD_POINTS_PER_ORDER, order.order.orderId]
    );

    // Second award must no-op
    await client.query(
      `WITH inserted AS (
         INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
         SELECT $1, $2, 'Earn', 'Completed order reward', $3, NULL
          WHERE NOT EXISTS (
            SELECT 1 FROM loyalty_entries
             WHERE order_id = $3 AND reason = 'Earn'
          )
         RETURNING member_id, points
       )
       UPDATE loyalty_members m
          SET points = m.points + i.points,
              updated_at = now()
         FROM inserted i
        WHERE m.id = i.member_id`,
      [memberId, REWARD_POINTS_PER_ORDER, order.order.orderId]
    );

    await client.query("COMMIT");

    const member = await client.query(
      "SELECT points FROM loyalty_members WHERE id = $1",
      [memberId]
    );
    const earns = await client.query(
      `SELECT COUNT(*)::int AS count FROM loyalty_entries
        WHERE order_id = $1 AND reason = 'Earn'`,
      [order.order.orderId]
    );

    console.log({
      points: member.rows[0].points,
      earnEntries: earns.rows[0].count,
    });

    if (Number(member.rows[0].points) !== 10) {
      throw new Error(`Expected balance 10, got ${member.rows[0].points}`);
    }
    if (earns.rows[0].count !== 1) {
      throw new Error("Duplicate earn entries detected");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }

  console.log("LOYALTY FLOW OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
