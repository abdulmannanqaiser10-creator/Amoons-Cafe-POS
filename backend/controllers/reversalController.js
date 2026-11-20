const bcrypt = require("bcryptjs");

const db = require("../config/db");
const { readSettings } = require("./settingsStore");
const {
  recordMovements,
  deductionsOf,
} = require("../services/catalogueLines");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PIN_RE = /^\d{5}$/;
const MIN_REASON = 4;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const badRequest = (res, message) => res.status(400).json({ message });

const serverError = (res, error) => {
  console.error(error);
  res.status(500).json({ message: "Server error" });
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

function mapReversal(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    amount: toNumber(row.amount),
    amountPaid: toNumber(row.amount_paid),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    statusBefore: row.status_before,
    reason: row.reason,
    channel: row.channel,
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    items: Array.isArray(row.items) ? row.items : [],
    performedBy: row.performed_by,
    performedByName: row.performed_by_name || "Unknown user",
    performedByRole: row.performed_by_role || "",
    authorizedByName: row.authorized_by_name || null,
    createdAt: row.created_at,
  };
}

const REVERSAL_SELECT = `
  SELECT r.*,
         o.order_number,
         o.channel,
         o.customer_name,
         o.customer_phone,
         COALESCE(
           (
             SELECT json_agg(
                      json_build_object(
                        'name', oi.product_name,
                        'quantity', oi.quantity
                      ) ORDER BY oi.id
                    )
               FROM order_items oi
              WHERE oi.order_id = r.order_id
           ),
           '[]'::json
         ) AS items,
         pu.display_name AS performed_by_name,
         pu.role         AS performed_by_role,
         au.display_name AS authorized_by_name
    FROM order_reversals r
    JOIN orders o       ON o.id = r.order_id
    LEFT JOIN users pu  ON pu.id = r.performed_by
    LEFT JOIN users au  ON au.id = r.authorized_by
`;

/**
 * A reversal is money leaving the till, so it needs an authority behind it:
 * either the signed-in account carries the right, or a manager PIN that does
 * is entered for this one action. The authorising account is stored either way.
 */
async function resolveAuthorizer(req, body) {
  const session = await db.query(
    "SELECT id, display_name, role, can_reverse, is_active FROM users WHERE id = $1",
    [req.user.id]
  );

  const me = session.rows[0];

  if (!me) return { error: "Your session no longer matches an account" };
  if (me.is_active === false) return { error: "This account has been deactivated" };
  const { value: security } = await readSettings("security");
  if (me.can_reverse && !security.requireManagerPinForReversal) {
    return { authorizer: me };
  }

  const pin = String(body.managerPin ?? "").trim();

  if (!pin) {
    return {
      error: "Reversing an order needs a manager PIN",
      needsManagerPin: true,
    };
  }

  if (!PIN_RE.test(pin)) {
    return { error: "Enter the manager's 5-digit PIN", needsManagerPin: true };
  }

  const candidates = await db.query(
    "SELECT id, display_name, role, pin_hash FROM users WHERE can_reverse = true AND is_active = true"
  );

  for (const candidate of candidates.rows) {
    if (await bcrypt.compare(pin, candidate.pin_hash)) {
      return { authorizer: candidate };
    }
  }

  return { error: "That PIN is not authorised to reverse orders", needsManagerPin: true };
}

/* ------------------------------------------------------------------ */
/* GET /api/reversals — reversal history                               */
/* ------------------------------------------------------------------ */

exports.history = async (req, res) => {
  try {
    const params = [];
    const where = [];

    const add = (clause, value) => {
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };

    const q = String(req.query.q ?? "").trim();
    if (q) {
      params.push(`%${q}%`, `%${q}%`);
      where.push(
        `(o.order_number ILIKE $${params.length - 1} OR r.reason ILIKE $${params.length})`
      );
    }

    const dateFrom = String(req.query.dateFrom ?? "").trim();
    if (dateFrom) {
      if (!DATE_RE.test(dateFrom)) {
        return badRequest(res, "dateFrom must be YYYY-MM-DD");
      }
      add("r.created_at >= ?::date", dateFrom);
    }

    const dateTo = String(req.query.dateTo ?? "").trim();
    if (dateTo) {
      if (!DATE_RE.test(dateTo)) {
        return badRequest(res, "dateTo must be YYYY-MM-DD");
      }
      add("r.created_at < (?::date + 1)", dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const summary = await db.query(
      `SELECT count(*)::int AS total, COALESCE(sum(r.amount_paid), 0) AS amount
         FROM order_reversals r
         JOIN orders o ON o.id = r.order_id
        ${whereSql}`,
      params
    );

    const listParams = [...params, limit, offset];
    const result = await db.query(
      `${REVERSAL_SELECT} ${whereSql}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      reversals: result.rows.map(mapReversal),
      total: summary.rows[0].total,
      amountReversed: toNumber(summary.rows[0].amount),
      limit,
      offset,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/orders/:id/reverse                                        */
/* ------------------------------------------------------------------ */

exports.reverse = async (req, res) => {
  const client = await db.connect();

  try {
    const body = req.body ?? {};

    const reason = String(body.reason ?? "").trim();

    if (reason.length < MIN_REASON) {
      client.release();
      return badRequest(
        res,
        `Give a reason of at least ${MIN_REASON} characters — it is part of the audit trail`
      );
    }

    const authorizer = await resolveAuthorizer(req, body);

    if (authorizer.error) {
      client.release();
      return res.status(403).json({
        message: authorizer.error,
        needsManagerPin: Boolean(authorizer.needsManagerPin),
      });
    }

    await client.query("BEGIN");

    // FOR UPDATE keeps two terminals from reversing the same sale at once;
    // the UNIQUE on order_id is the last line of defence.
    const locked = await client.query(
      "SELECT * FROM orders WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );

    const order = locked.rows[0];

    if (!order) {
      await client.query("ROLLBACK");
      client.release();
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status === "Reversed") {
      await client.query("ROLLBACK");
      client.release();
      return res
        .status(409)
        .json({ message: `${order.order_number} has already been reversed` });
    }

    if (order.status === "Cancelled") {
      await client.query("ROLLBACK");
      client.release();
      return res.status(409).json({
        message: `${order.order_number} is cancelled, not a sale to reverse`,
      });
    }

    await client.query(
      `INSERT INTO order_reversals
         (order_id, amount, amount_paid, payment_method, payment_status,
          status_before, reason, performed_by, authorized_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        order.id,
        order.total,
        order.amount_paid,
        order.payment_method,
        order.payment_status,
        order.status,
        reason.slice(0, 500),
        req.user.id,
        authorizer.authorizer.id,
      ]
    );

    await client.query(
      `UPDATE orders
          SET status = 'Reversed', reversed_at = now(), updated_at = now()
        WHERE id = $1`,
      [order.id]
    );

    // The sale is being unwound, so the stock those lines consumed goes back.
    const consumed = await deductionsOf(client, order.id);

    if (consumed.length) {
      await recordMovements(client, consumed, {
        userId: req.user.id,
        orderId: order.id,
        reason: "Return",
      });
    }

    await client.query("COMMIT");
    client.release();

    const fresh = await db.query(`${REVERSAL_SELECT} WHERE r.order_id = $1`, [
      order.id,
    ]);

    res.json({
      message: `${order.order_number} reversed`,
      reversal: mapReversal(fresh.rows[0]),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();

    // 23505 = the unique order_id guard fired on a concurrent double submit.
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ message: "That order has already been reversed" });
    }

    serverError(res, error);
  }
};
