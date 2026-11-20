const db = require("../config/db");
const { badRequest, notFound, serverError } = require("../helpers/http");
const { REWARD_TIERS } = require("../services/rewardTiers");

const MEMBER_SQL = `
  SELECT m.id,
         m.name,
         m.phone,
         m.email,
         m.points,
         m.created_at AS "createdAt",
         m.updated_at AS "updatedAt"
    FROM loyalty_members m
`;

exports.list = async (_req, res) => {
  try {
    const members = await db.query(
      `${MEMBER_SQL}
        ORDER BY m.updated_at DESC NULLS LAST, m.name`
    );

    const spend = await db.query(
      `SELECT regexp_replace(customer_phone, '\\D', '', 'g') AS digits,
              COUNT(*)::int AS "orderCount",
              COALESCE(SUM(total), 0)::float AS "totalSpent",
              MAX(delivery_address) AS "lastAddress",
              MAX(created_at) AS "lastOrderAt"
         FROM orders
        WHERE customer_phone IS NOT NULL
          AND status NOT IN ('Cancelled', 'Reversed')
        GROUP BY regexp_replace(customer_phone, '\\D', '', 'g')`
    );

    const spendByPhone = new Map(
      spend.rows.map((row) => [row.digits, row])
    );

    const customers = members.rows.map((member) => {
      const digits = String(member.phone || "").replace(/\D/g, "");
      const stats = spendByPhone.get(digits) || {};
      return {
        ...member,
        orderCount: stats.orderCount || 0,
        totalSpent: stats.totalSpent || 0,
        lastAddress: stats.lastAddress || null,
        lastOrderAt: stats.lastOrderAt || null,
      };
    });

    res.json({
      customers,
      rewardTiers: REWARD_TIERS,
      totals: {
        customers: customers.length,
        withOrders: customers.filter((c) => c.orderCount > 0).length,
        outstandingPoints: customers.reduce((sum, c) => sum + (c.points || 0), 0),
      },
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.detail = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown customer.");

    const member = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [id]);
    if (!member.rowCount) return notFound(res, "Customer not found.");

    const customer = member.rows[0];
    const digits = String(customer.phone || "").replace(/\D/g, "");

    const orders = await db.query(
      `SELECT id, order_number AS "orderNumber", status, channel,
              payment_method AS "paymentMethod", payment_status AS "paymentStatus",
              subtotal, tax_amount AS "taxAmount", total,
              delivery_address AS "deliveryAddress",
              created_at AS "createdAt"
         FROM orders
        WHERE regexp_replace(customer_phone, '\\D', '', 'g') = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [digits]
    );

    const entries = await db.query(
      `SELECT e.id, e.points, e.reason, e.note, e.created_at AS "createdAt",
              o.order_number AS "orderNumber"
         FROM loyalty_entries e
         LEFT JOIN orders o ON o.id = e.order_id
        WHERE e.member_id = $1
        ORDER BY e.created_at DESC
        LIMIT 200`,
      [id]
    );

    const totalSpent = orders.rows
      .filter((o) => !["Cancelled", "Reversed"].includes(o.status))
      .reduce((sum, o) => sum + Number(o.total || 0), 0);

    res.json({
      customer: {
        ...customer,
        orderCount: orders.rows.length,
        totalSpent,
        lastAddress: orders.rows.find((o) => o.deliveryAddress)?.deliveryAddress || null,
      },
      orders: orders.rows,
      rewardHistory: entries.rows,
      rewardTiers: REWARD_TIERS,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.redeem = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown customer.");

    const pointsCost = Math.trunc(Number(req.body?.points));
    const tier = REWARD_TIERS.find((t) => t.points === pointsCost);
    if (!tier) {
      return badRequest(
        res,
        "Choose a valid reward tier (10, 20, or 50 points)."
      );
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const member = await client.query(
        "SELECT id, name, points FROM loyalty_members WHERE id = $1 FOR UPDATE",
        [id]
      );
      if (!member.rowCount) {
        await client.query("ROLLBACK");
        return notFound(res, "Customer not found.");
      }

      if (member.rows[0].points < tier.points) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: `${member.rows[0].name} only has ${member.rows[0].points} points.`,
        });
      }

      const balance = member.rows[0].points - tier.points;
      await client.query(
        "UPDATE loyalty_members SET points = $1, updated_at = now() WHERE id = $2",
        [balance, id]
      );
      await client.query(
        `INSERT INTO loyalty_entries (member_id, points, reason, note, performed_by)
         VALUES ($1, $2, 'Redeem', $3, $4)`,
        [
          id,
          -tier.points,
          `Redeemed ${tier.label} (${tier.points} pts)`,
          req.user?.id ?? null,
        ]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const updated = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [id]);
    res.json({
      message: `Redeemed ${tier.label}`,
      customer: updated.rows[0],
      reward: tier,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.REWARD_TIERS = REWARD_TIERS;
