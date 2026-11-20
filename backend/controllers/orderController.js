const db = require("../config/db");
const { applyTax } = require("./businessController");
const { readSettings } = require("./settingsStore");
const { round2 } = require("../helpers/http");
const {
  resolveLines,
  recordMovements,
  deductionsOf,
} = require("../services/catalogueLines");

const CHANNELS = ["Dine-In", "Takeaway", "Delivery", "Foodpanda", "Web"];
const STATUSES = [
  "Pending",
  "Preparing",
  "Ready",
  "Completed",
  "Cancelled",
  "Reversed",
];
const PAYMENT_METHODS = ["Cash", "Card"];
const PAYMENT_STATUSES = ["Paid", "Unpaid"];

const DELIVERY_CHANNELS = ["Delivery", "Foodpanda"];
const {
  findRewardTier,
  REWARD_POINTS_PER_ORDER,
} = require("../services/rewardTiers");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A reversed sale is closed for business: it no longer counts as revenue and
// it must not be re-driven through the status flow.
const CLOSED_STATUSES = ["Cancelled", "Reversed"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const badRequest = (res, message) => res.status(400).json({ message });

const notFound = (res) =>
  res.status(404).json({ message: "Order not found" });

const serverError = (res, error) => {
  console.error(error);
  res.status(500).json({ message: "Server error" });
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function phoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhone(value) {
  const raw = String(value ?? "").trim().slice(0, 40);
  const digits = phoneDigits(raw);
  return { raw: raw || null, digits };
}

function validateCustomerPhone(value) {
  const { raw, digits } = normalizePhone(value);
  if (!raw) return null;
  if (digits.length < 10 || digits.length > 15) {
    return "Enter a valid customer phone number (10–15 digits).";
  }
  return null;
}

/** Discount is always taken off the subtotal before GST. */
function applyOrderDiscount(subtotal, body = {}) {
  const type = String(body.discountType ?? "none");
  const percent = Number(body.discountPercentage ?? body.discountValue ?? 0);
  let amount = round2(Math.max(0, Number(body.discountAmount) || 0));

  if (type === "percentage") {
    if (!(percent > 0) || percent > 100) {
      return { error: "Discount percentage must be between 1 and 100" };
    }
    amount = round2(subtotal * (percent / 100));
  } else if (type === "fixed") {
    if (amount < 0) return { error: "Fixed discount must be positive" };
    amount = Math.min(amount, round2(subtotal));
  } else if (type === "none" || !type) {
    return { type: "none", amount: 0, percent: 0, after: round2(subtotal) };
  } else {
    return { error: "Invalid discount type" };
  }

  if (!(amount > 0)) {
    return { type: "none", amount: 0, percent: 0, after: round2(subtotal) };
  }

  amount = Math.min(amount, round2(subtotal));
  return {
    type: type === "percentage" ? "percentage" : "fixed",
    amount,
    percent: type === "percentage" ? round2(percent) : 0,
    after: round2(subtotal - amount),
  };
}

async function redeemLoyaltyForOrder(client, order, redeemPoints, userId) {
  const tier = findRewardTier(redeemPoints);
  if (!tier) return { error: "Choose a valid reward tier (10, 20, or 50 points)." };

  const { digits } = normalizePhone(order.customerPhone);
  if (!digits) {
    return { error: "A customer phone number is required to redeem points." };
  }

  const member = await client.query(
    `SELECT id, name, points FROM loyalty_members
      WHERE regexp_replace(phone, '\\D', '', 'g') = $1
      ORDER BY id
      FOR UPDATE`,
    [digits]
  );

  if (!member.rowCount) {
    return { error: "No loyalty member found for this phone number." };
  }

  if (member.rows[0].points < tier.points) {
    return {
      error: `${member.rows[0].name} only has ${member.rows[0].points} points.`,
    };
  }

  const balance = member.rows[0].points - tier.points;

  await client.query(
    "UPDATE loyalty_members SET points = $1, updated_at = now() WHERE id = $2",
    [balance, member.rows[0].id]
  );

  await client.query(
    `INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
     VALUES ($1, $2, 'Redeem', $3, $4, $5)`,
    [
      member.rows[0].id,
      -tier.points,
      `Till redeem · ${tier.label} (${tier.points} pts)`,
      order.id,
      userId ?? null,
    ]
  );

  return { balance, redeemedPoints: tier.points, tier };
}

/**
 * Awards exactly 10 points once per completed+paid order.
 * Uses a partial unique Earn index — never ON CONFLICT(order_id) alone,
 * because Redeem rows may already reference the same order_id.
 */
async function awardLoyaltyForOrder(client, order, userId) {
  const { raw, digits } = normalizePhone(order.customerPhone);
  if (!digits) return { awarded: 0 };

  let member = await client.query(
    `SELECT id FROM loyalty_members
      WHERE regexp_replace(phone, '\\D', '', 'g') = $1
      ORDER BY id
      FOR UPDATE`,
    [digits]
  );

  if (member.rowCount === 0) {
    try {
      const created = await client.query(
        `INSERT INTO loyalty_members (name, phone, points)
         VALUES ($1, $2, 0)
         RETURNING id`,
        [order.customerName || `Customer ${digits}`, raw || digits]
      );
      member = created;
    } catch (error) {
      if (error.code === "23505") {
        member = await client.query(
          `SELECT id FROM loyalty_members
            WHERE regexp_replace(phone, '\\D', '', 'g') = $1
            ORDER BY id
            FOR UPDATE`,
          [digits]
        );
      } else {
        throw error;
      }
    }
  }

  const memberId = member.rows[0]?.id;
  if (!memberId) return { awarded: 0 };

  const result = await client.query(
    `WITH inserted AS (
       INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
       SELECT $1, $2, 'Earn', 'Completed order reward', $3, $4
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
      WHERE m.id = i.member_id
      RETURNING i.points AS awarded`,
    [memberId, REWARD_POINTS_PER_ORDER, order.id, userId ?? null]
  );

  return { awarded: result.rows[0]?.awarded || 0, memberId };
}

/** Derives Paid / Unpaid / Partial from how much has actually been paid. */
function derivePaymentStatus(amountPaid, total) {
  if (amountPaid <= 0) return "Unpaid";
  if (amountPaid >= total) return "Paid";
  return "Partial";
}

function mapOrder(row) {
  const items = (row.items || []).map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.name,
    category: item.category,
    price: toNumber(item.price),
    quantity: item.quantity,
    lineTotal: toNumber(item.lineTotal),
  }));

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name || "",
    customerPhone: row.customer_phone || "",
    channel: row.channel,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    amountPaid: toNumber(row.amount_paid),
    subtotal: toNumber(row.subtotal),
    discountAmount: toNumber(row.discount_amount),
    discountType: row.discount_type || "none",
    discountAfterTax: row.discount_after_tax === true,
    taxRate: toNumber(row.tax_rate),
    taxAmount: toNumber(row.tax_amount),
    taxTotal: toNumber(row.tax_amount),
    discountPercent: toNumber(row.discount_percent),
    total: toNumber(row.total),
    note: row.note || "",
    riderName: row.rider_name || "",
    riderPhone: row.rider_phone || "",
    deliveryAddress: row.delivery_address || "",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reversedAt: row.reversed_at || null,
    srbInvoiceId: row.srb_invoice_id || "",
    srbStatus: row.srb_status || "",
    srbQrLink: row.srb_qr_link || "",
    srbResCode: row.srb_res_code || "",
    srbError: row.srb_error || "",
    srbSubmittedAt: row.srb_submitted_at || null,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    balanceDue: Math.max(0, toNumber(row.total) - toNumber(row.amount_paid)),
    reversible: row.reversible === true,
    reversal: row.reversal ? mapReversal(row.reversal) : null,
  };
}

function mapReversal(raw) {
  return {
    id: raw.id,
    amount: toNumber(raw.amount),
    amountPaid: toNumber(raw.amountPaid),
    paymentMethod: raw.paymentMethod,
    paymentStatus: raw.paymentStatus,
    statusBefore: raw.statusBefore,
    reason: raw.reason || "",
    performedByName: raw.performedByName || "Unknown user",
    performedByRole: raw.performedByRole || "",
    authorizedByName: raw.authorizedByName || null,
    createdAt: raw.createdAt,
  };
}

// Column headers sort here rather than in the browser, so the order is the
// whole result set's, not the visible page's. Only these names reach the SQL.
const SORT_COLUMNS = {
  order: "o.order_number",
  createdAt: "o.created_at",
  channel: "o.channel",
  payment: "o.payment_method",
  status: "o.status",
  total: "o.total",
};

// Line items and the reversal record each come from their own LATERAL, so the
// query needs no GROUP BY and stays legal once non-orders columns are selected.
const ORDER_SELECT = `
  SELECT o.*,
    it.items,
    rv.reversal,
    (rv.reversal IS NULL AND o.status NOT IN ('Cancelled','Reversed')) AS reversible
  FROM orders o
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id',        oi.id,
          'productId', oi.product_id,
          'name',      oi.product_name,
          'category',  oi.category,
          'price',     oi.unit_price,
          'quantity',  oi.quantity,
          'lineTotal', oi.line_total
        ) ORDER BY oi.id
      ),
      '[]'::json
    ) AS items
    FROM order_items oi
    WHERE oi.order_id = o.id
  ) it ON TRUE
  LEFT JOIN LATERAL (
    SELECT json_build_object(
             'id',              r.id,
             'amount',          r.amount,
             'amountPaid',      r.amount_paid,
             'paymentMethod',   r.payment_method,
             'paymentStatus',   r.payment_status,
             'statusBefore',    r.status_before,
             'reason',          r.reason,
             'performedByName', pu.display_name,
             'performedByRole', pu.role,
             'authorizedByName', au.display_name,
             'createdAt',       r.created_at
           ) AS reversal
    FROM order_reversals r
    LEFT JOIN users pu ON pu.id = r.performed_by
    LEFT JOIN users au ON au.id = r.authorized_by
    WHERE r.order_id = o.id
    ORDER BY r.id DESC
    LIMIT 1
  ) rv ON TRUE
`;

/**
 * The tax profile lives in settings, so every order is priced with the rule
 * the manager set at the time it was written. The rate and amount are stored
 * on the order to keep old bills reproducible after the settings change.
 */
async function taxOf(subtotal, client = db) {
  const { value } = await readSettings("tax", client);
  return applyTax(subtotal, value);
}

async function insertLines(client, orderId, items) {
  for (const item of items) {
    await client.query(
      `INSERT INTO order_items
         (order_id, product_id, product_name, category, unit_price, quantity, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orderId,
        item.productId,
        item.name,
        item.category,
        item.price,
        item.quantity,
        item.lineTotal,
      ]
    );
  }
}

/**
 * Gives back the stock a live order had taken out. Only called on the first
 * transition into a closed status, so a unit is never returned twice.
 */
async function restoreStock(client, orderId, userId) {
  const lines = await deductionsOf(client, orderId);

  if (!lines.length) return;

  await recordMovements(client, lines, {
    userId,
    orderId,
    reason: "Return",
  });
}

async function fetchOrder(id, queryable = db) {
  const result = await queryable.query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);

  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/* GET /api/orders — list with search, filters and pagination          */
/* ------------------------------------------------------------------ */

exports.list = async (req, res) => {
  try {
    const params = [];
    const where = [];

    const add = (clause, value) => {
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };

    // Staff see their own till orders plus website intake (created_by IS NULL).
    if (req.user.role !== "admin") {
      params.push(req.user.id);
      where.push(`(o.created_by = $${params.length} OR o.created_by IS NULL)`);
    }

    const q = String(req.query.q ?? "").trim();
    if (q) {
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
      const a = params.length - 4;
      const b = params.length - 3;
      const c = params.length - 2;
      const d = params.length - 1;
      const e = params.length;
      where.push(
        `(o.order_number ILIKE $${a} ` +
          `OR o.customer_name ILIKE $${b} ` +
          `OR o.customer_phone ILIKE $${c} ` +
          `OR o.rider_name ILIKE $${d} ` +
          `OR EXISTS (
            SELECT 1
              FROM order_items search_item
             WHERE search_item.order_id = o.id
               AND search_item.product_name ILIKE $${e}
          ))`
      );
    }

    const status = String(req.query.status ?? "").trim();
    if (status) {
      if (!STATUSES.includes(status)) {
        return badRequest(res, "Unknown order status");
      }
      add("o.status = ?", status);
    }

    const channel = String(req.query.channel ?? "").trim();
    if (channel) {
      if (!CHANNELS.includes(channel)) {
        return badRequest(res, "Unknown order channel");
      }
      add("o.channel = ?", channel);
    }

    const paymentMethod = String(req.query.paymentMethod ?? "").trim();
    if (paymentMethod) {
      if (!PAYMENT_METHODS.includes(paymentMethod)) {
        return badRequest(res, "Unknown payment method");
      }
      add("o.payment_method = ?", paymentMethod);
    }

    const paymentStatus = String(req.query.paymentStatus ?? "").trim();
    if (paymentStatus) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        return badRequest(res, "Unknown payment status");
      }
      add("o.payment_status = ?", paymentStatus);
    }

    // The reversal screen lists only sales that can still be reversed, so the
    // rule lives next to the filters instead of in the client.
    if (String(req.query.reversible ?? "") === "true") {
      where.push(
        "o.status NOT IN ('Cancelled','Reversed')",
        "NOT EXISTS (SELECT 1 FROM order_reversals r WHERE r.order_id = o.id)"
      );
    }

    const dateFrom = String(req.query.dateFrom ?? "").trim();
    if (dateFrom) {
      if (!DATE_RE.test(dateFrom)) {
        return badRequest(res, "dateFrom must be YYYY-MM-DD");
      }
      add("o.created_at >= ?::date", dateFrom);
    }

    const dateTo = String(req.query.dateTo ?? "").trim();
    if (dateTo) {
      if (!DATE_RE.test(dateTo)) {
        return badRequest(res, "dateTo must be YYYY-MM-DD");
      }
      add("o.created_at < (?::date + 1)", dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sorted = SORT_COLUMNS[String(req.query.sort ?? "").trim()];
    const orderSql = sorted
      ? `ORDER BY ${sorted} ${String(req.query.dir ?? "").toLowerCase() === "asc" ? "ASC" : "DESC"}, o.id DESC`
      : "ORDER BY o.created_at DESC, o.id DESC";

    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countResult = await db.query(
      `SELECT count(*)::int AS total FROM orders o ${whereSql}`,
      params
    );

    const listParams = [...params, limit, offset];
    const result = await db.query(
      `${ORDER_SELECT} ${whereSql}
       ${orderSql}
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      orders: result.rows.map(mapOrder),
      total: countResult.rows[0].total,
      limit,
      offset,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/orders/stats — dashboard counters                          */
/* ------------------------------------------------------------------ */

exports.stats = async (req, res) => {
  try {
    const rawDate = String(req.query.date ?? "").trim();
    const date = DATE_RE.test(rawDate) ? rawDate : null;
    const staffScope =
      req.user.role !== "admin" ? " AND created_by = $2" : "";
    const params = req.user.role !== "admin" ? [date, req.user.id] : [date];

    const result = await db.query(
      `SELECT
         count(*) FILTER (
           WHERE created_at::date = COALESCE($1::date, now()::date)
         )::int AS today_orders,
         COALESCE(sum(total) FILTER (
           WHERE created_at::date = COALESCE($1::date, now()::date)
             AND status NOT IN ('Cancelled','Reversed')
         ), 0) AS today_revenue,
         count(*) FILTER (WHERE status = 'Pending')::int    AS pending,
         count(*) FILTER (WHERE status = 'Preparing')::int  AS preparing,
         count(*) FILTER (WHERE status = 'Ready')::int      AS ready,
         count(*) FILTER (WHERE status = 'Completed')::int  AS completed,
         count(*) FILTER (WHERE status = 'Cancelled')::int  AS cancelled,
         count(*) FILTER (WHERE status = 'Reversed')::int   AS reversed,
         count(*) FILTER (
           WHERE status NOT IN ('Cancelled','Reversed')
         )::int AS open_orders,
         count(*) FILTER (
           WHERE payment_status <> 'Paid'
             AND status NOT IN ('Cancelled','Reversed')
         )::int AS unpaid_orders,
         COALESCE(sum(total - amount_paid) FILTER (
           WHERE payment_status <> 'Paid'
             AND status NOT IN ('Cancelled','Reversed')
         ), 0) AS outstanding,
         COALESCE(sum(total) FILTER (
           WHERE status NOT IN ('Cancelled','Reversed')
         ), 0) AS gross
       FROM orders
       WHERE TRUE${staffScope}`,
      params
    );

    const row = result.rows[0];

    res.json({
      todayOrders: row.today_orders,
      todayRevenue: toNumber(row.today_revenue),
      pending: row.pending,
      preparing: row.preparing,
      ready: row.ready,
      completed: row.completed,
      cancelled: row.cancelled,
      reversed: row.reversed,
      openOrders: row.open_orders,
      unpaidOrders: row.unpaid_orders,
      outstanding: toNumber(row.outstanding),
      gross: toNumber(row.gross),
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/orders/:id — full detail                                   */
/* ------------------------------------------------------------------ */

exports.getOne = async (req, res) => {
  try {
    const order = await fetchOrder(req.params.id);

    if (!order) return notFound(res);
    if (req.user.role !== "admin" && Number(order.createdBy) !== Number(req.user.id)) {
      return notFound(res);
    }

    res.json({ order });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/orders — create from the Home page cart                   */
/* ------------------------------------------------------------------ */

exports.create = async (req, res) => {
  try {
    const body = req.body ?? {};

    const channel = String(body.channel ?? "Dine-In");
    if (!CHANNELS.includes(channel)) {
      return badRequest(res, "Unknown order channel");
    }

    const paymentMethod = String(body.paymentMethod ?? "Cash");
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return badRequest(res, "Unknown payment method");
    }

    const discountAfterTax = false;

    const customerName = String(body.customerName ?? "").trim().slice(0, 120);
    const customerPhoneInput = normalizePhone(body.customerPhone);
    const phoneError = validateCustomerPhone(body.customerPhone);
    if (phoneError) return badRequest(res, phoneError);
    const customerPhone = customerPhoneInput.raw;
    const riderName = String(body.riderName ?? "").trim().slice(0, 120);
    const riderPhone = String(body.riderPhone ?? "").trim().slice(0, 40);
    const deliveryAddress = String(body.deliveryAddress ?? "").trim();
    const note = String(body.note ?? "").trim();

    if (DELIVERY_CHANNELS.includes(channel) && !deliveryAddress) {
      return badRequest(res, "A delivery address is required for this channel");
    }

    const client = await db.connect();
    let orderId = null;

    try {
      await client.query("BEGIN");

      // Lines are priced from the catalogue, not from what the till rendered,
      // so a stale or edited tab can never set its own total.
      const resolved = await resolveLines(client, body.items);

      if (resolved.error) {
        await client.query("ROLLBACK");
        return badRequest(res, resolved.error);
      }

      const { items, subtotal, deductions } = resolved;

      const discount = applyOrderDiscount(subtotal, body);
      if (discount.error) {
        await client.query("ROLLBACK");
        return badRequest(res, discount.error);
      }

      const tax = await taxOf(discount.after, client);
      const total = tax.total;

      const amountPaid = Math.min(
        Math.max(0, Math.round(toNumber(body.amountPaid) * 100) / 100),
        total
      );
      const paymentStatus = derivePaymentStatus(amountPaid, total);

      const orderResult = await client.query(
        `INSERT INTO orders
           (order_number, customer_name, customer_phone, channel, status, payment_method,
            payment_status, amount_paid, subtotal, discount_amount, discount_type, discount_percent,
            discount_after_tax, tax_rate, tax_amount, total,
            note, rider_name, rider_phone, delivery_address, created_by)
         VALUES (
           'ORD-' || to_char(now(), 'YYMMDD') || '-' ||
             lpad(nextval('order_number_seq')::text, 5, '0'),
           $1, $2, $3, 'Pending', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         )
         RETURNING id`,
        [
          customerName || null,
          customerPhone,
          channel,
          paymentMethod,
          paymentStatus,
          amountPaid,
          subtotal,
          discount.amount,
          discount.type,
          discount.percent,
          discountAfterTax,
          tax.rate,
          tax.taxAmount,
          total,
          note || null,
          riderName || null,
          riderPhone || null,
          deliveryAddress || null,
          req.user?.id ?? null,
        ]
      );

      orderId = orderResult.rows[0].id;
      await insertLines(client, orderId, items);

      if (deductions.length) {
        await recordMovements(client, deductions, {
          userId: req.user?.id ?? null,
          orderId,
          reason: "Sale",
        });
      }

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore rollback errors after a failed begin/commit */
      }
      throw error;
    } finally {
      // Release before any further pool queries. On Vercel the pool max is 1,
      // so fetchOrder() while this client is still checked out deadlocks.
      client.release();
    }

    const order = await fetchOrder(orderId);
    if (!order) {
      return res.status(500).json({
        message: "Order was saved but could not be reloaded.",
      });
    }

    res.status(201).json({ message: "Order created", order });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* PUT /api/orders/:id — edit header and line items                    */
/* ------------------------------------------------------------------ */

exports.update = async (req, res) => {
  try {
    const existing = await fetchOrder(req.params.id);
    if (!existing) return notFound(res);
    if (req.user.role !== "admin" && Number(existing.createdBy) !== Number(req.user.id)) {
      return notFound(res);
    }

    if (CLOSED_STATUSES.includes(existing.status)) {
      return res.status(409).json({
        message: `A ${existing.status.toLowerCase()} order cannot be edited`,
      });
    }

    const body = req.body ?? {};

    const channel = String(body.channel ?? existing.channel);
    if (!CHANNELS.includes(channel)) {
      return badRequest(res, "Unknown order channel");
    }

    const paymentMethod = String(
      body.paymentMethod ?? existing.paymentMethod
    );
    if (
      body.paymentMethod !== undefined &&
      !PAYMENT_METHODS.includes(paymentMethod)
    ) {
      return badRequest(res, "Unknown payment method");
    }

    const changingItems = body.items !== undefined;

    const customerName =
      body.customerName === undefined
        ? existing.customerName
        : String(body.customerName).trim().slice(0, 120);

    let customerPhone = existing.customerPhone;
    if (body.customerPhone !== undefined) {
      const phoneError = validateCustomerPhone(body.customerPhone);
      if (phoneError) return badRequest(res, phoneError);
      customerPhone = normalizePhone(body.customerPhone).raw || "";
    }

    const riderName =
      body.riderName === undefined
        ? existing.riderName
        : String(body.riderName).trim().slice(0, 120);

    const riderPhone =
      body.riderPhone === undefined
        ? existing.riderPhone
        : String(body.riderPhone).trim().slice(0, 40);

    const deliveryAddress =
      body.deliveryAddress === undefined
        ? existing.deliveryAddress
        : String(body.deliveryAddress).trim();

    const note =
      body.note === undefined
        ? existing.note
        : String(body.note).trim();

    if (DELIVERY_CHANNELS.includes(channel) && !deliveryAddress) {
      return badRequest(res, "A delivery address is required for this channel");
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      let items = existing.items;
      let subtotal = existing.subtotal;
      let total = existing.total;
      let taxRate = existing.taxRate;
      let taxAmount = existing.taxAmount;
      let deductions = [];

      if (changingItems) {
        // The units the old lines took out go back before the new lines are
        // checked, otherwise editing a quantity down loses stock for good.
        const returned = await deductionsOf(client, existing.id);

        if (returned.length) {
          await recordMovements(client, returned, {
            userId: req.user?.id ?? null,
            orderId: existing.id,
            reason: "Return",
          });
        }

        const resolved = await resolveLines(client, body.items);

        if (resolved.error) {
          await client.query("ROLLBACK");
          return badRequest(res, resolved.error);
        }

        items = resolved.items;
        subtotal = resolved.subtotal;
        deductions = resolved.deductions;

      }

      const amountPaid =
        body.amountPaid === undefined
          ? existing.amountPaid
          : Math.max(0, Math.round(toNumber(body.amountPaid) * 100) / 100);

      const discount = applyOrderDiscount(subtotal, {
        discountType: body.discountType ?? existing.discountType,
        discountAmount: body.discountAmount ?? existing.discountAmount,
        discountPercentage:
          body.discountPercentage ?? existing.discountPercent ?? 0,
      });
      if (discount.error) {
        await client.query("ROLLBACK");
        return badRequest(res, discount.error);
      }

      const tax = await taxOf(discount.after, client);
      const recalculatedTotal = tax.total;
      const recalculatedTaxAmount = tax.taxAmount;
      const recalculatedTaxRate = tax.rate;

      const paid = Math.min(amountPaid, recalculatedTotal);
      const paymentStatus = derivePaymentStatus(paid, recalculatedTotal);

      await client.query(
        `UPDATE orders
            SET customer_name    = $1,
                customer_phone  = $2,
                channel          = $3,
                payment_method   = $4,
                payment_status   = $5,
                amount_paid      = $6,
                subtotal         = $7,
                discount_amount  = $8,
                discount_type    = $9,
                discount_percent = $10,
                discount_after_tax = false,
                tax_rate         = $11,
                tax_amount       = $12,
                total            = $13,
                note             = $14,
                rider_name       = $15,
                rider_phone      = $16,
                delivery_address = $17,
                updated_at       = now()
          WHERE id = $18`,
        [
          customerName || null,
          customerPhone || null,
          channel,
          paymentMethod,
          paymentStatus,
          paid,
          subtotal,
          discount.amount,
          discount.type,
          discount.percent,
          recalculatedTaxRate,
          recalculatedTaxAmount,
          recalculatedTotal,
          note || null,
          riderName || null,
          riderPhone || null,
          deliveryAddress || null,
          existing.id,
        ]
      );

      if (changingItems) {
        await client.query("DELETE FROM order_items WHERE order_id = $1", [
          existing.id,
        ]);
        await insertLines(client, existing.id, items);

        if (deductions.length) {
          await recordMovements(client, deductions, {
            userId: req.user?.id ?? null,
            orderId: existing.id,
            reason: "Sale",
          });
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const order = await fetchOrder(existing.id);
    res.json({ message: "Order updated", order });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* PATCH /api/orders/:id/status — update status                        */
/* ------------------------------------------------------------------ */

exports.updateStatus = async (req, res) => {
  try {
    const status = String(req.body?.status ?? "");

    if (!STATUSES.includes(status)) {
      return badRequest(res, "Unknown order status");
    }

    const existing = await fetchOrder(req.params.id);
    if (!existing) return notFound(res);

    if (status === "Reversed") {
      return badRequest(
        res,
        "Reversal is recorded through the reversal screen, not the status flow"
      );
    }

    if (CLOSED_STATUSES.includes(existing.status)) {
      return res.status(409).json({
        message: `A ${existing.status.toLowerCase()} order cannot move on from ${existing.status}`,
      });
    }

    if (existing.status === status) {
      return res.json({ message: "Order status unchanged", order: existing });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        "UPDATE orders SET status = $1, updated_at = now() WHERE id = $2",
        [status, existing.id]
      );

      if (status === "Cancelled") {
        await restoreStock(client, existing.id, req.user?.id ?? null);
      }

      if (status === "Completed") {
        const fullyPaid =
          existing.paymentStatus === "Paid" ||
          Number(existing.amountPaid) >= Number(existing.total);

        if (fullyPaid && existing.paymentStatus !== "Paid") {
          await client.query(
            `UPDATE orders
                SET payment_status = 'Paid',
                    amount_paid = GREATEST(amount_paid, total),
                    updated_at = now()
              WHERE id = $1`,
            [existing.id]
          );
        }

        if (fullyPaid) {
          await awardLoyaltyForOrder(
            client,
            { ...existing, status, paymentStatus: "Paid" },
            req.user?.id ?? null
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const order = await fetchOrder(existing.id);
    if (status === "Completed") {
      try {
        await require("../services/emailNotifications").awaitNewSale(order);
      } catch (emailError) {
        console.error("[email] Failed to send sale notification:", emailError.message);
      }
    }
    res.json({ message: `Order marked ${status}`, order });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/orders/:id/complete — finalise a printed checkout         */
/* ------------------------------------------------------------------ */

exports.complete = async (req, res) => {
  try {
    const existing = await fetchOrder(req.params.id);
    if (!existing) return notFound(res);
    if (req.user.role !== "admin" && Number(existing.createdBy) !== Number(req.user.id)) {
      return notFound(res);
    }

    if (
      existing.status === "Completed" &&
      existing.paymentStatus === "Paid" &&
      existing.amountPaid >= existing.total
    ) {
      return res.json({ message: "Order already completed and paid", order: existing });
    }

    if (existing.status !== "Pending") {
      return res.status(409).json({
        message: `A ${existing.status.toLowerCase()} order cannot be completed from checkout`,
      });
    }

    const redeemPoints = Math.trunc(Number(req.body?.redeemPoints) || 0);

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const updated = await client.query(
        `UPDATE orders
            SET status = 'Completed',
                payment_status = 'Paid',
                amount_paid = total,
                updated_at = now()
          WHERE id = $1 AND status = 'Pending'
          RETURNING id`,
        [existing.id]
      );

      if (updated.rowCount !== 1) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "The order changed before checkout could be completed",
        });
      }

      if (redeemPoints > 0) {
        const redeemed = await redeemLoyaltyForOrder(
          client,
          existing,
          redeemPoints,
          req.user?.id ?? null
        );
        if (redeemed.error) {
          await client.query("ROLLBACK");
          return badRequest(res, redeemed.error);
        }
      }

      await awardLoyaltyForOrder(
        client,
        { ...existing, status: "Completed", paymentStatus: "Paid" },
        req.user?.id ?? null
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // SRB fiscalisation runs after commit so a gateway outage never rolls back the sale.
    let order = await fetchOrder(existing.id);
    let srbResult = null;
    try {
      const srb = require("./srbController");
      srbResult = await srb.submitOrderToSrb(order);
      if (!srbResult.skipped) {
        await srb.persistSrbResult(order.id, srbResult);
        order = await fetchOrder(existing.id);
      }
    } catch (srbError) {
      console.error("SRB submission failed:", srbError.message);
      srbResult = {
        ok: false,
        status: "Failed",
        errors: [srbError.message || "SRB submission failed."],
      };
    }

    try {
      await require("../services/emailNotifications").awaitNewSale(order);
    } catch (emailError) {
      console.error("[email] Failed to send sale notification:", emailError.message);
    }

    res.json({
      message: "Order completed and paid",
      order,
      srb: srbResult
        ? {
            ok: Boolean(srbResult.ok),
            skipped: Boolean(srbResult.skipped),
            status: srbResult.status || null,
            srbInvoiceId: srbResult.srbInvoiceId || null,
            qrCodeLink: srbResult.qrCodeLink || null,
            errors: srbResult.errors || [],
          }
        : null,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* PATCH /api/orders/:id/payment — method + amount paid                */
/* ------------------------------------------------------------------ */

exports.updatePayment = async (req, res) => {
  try {
    const existing = await fetchOrder(req.params.id);
    if (!existing) return notFound(res);

    const body = req.body ?? {};

    const paymentMethod =
      body.paymentMethod === undefined
        ? existing.paymentMethod
        : String(body.paymentMethod);

    if (
      body.paymentMethod !== undefined &&
      !PAYMENT_METHODS.includes(paymentMethod)
    ) {
      return badRequest(res, "Unknown payment method");
    }

    const amountPaid =
      body.amountPaid === undefined
        ? existing.amountPaid
        : Math.max(0, Math.round(toNumber(body.amountPaid) * 100) / 100);

    const capped = Math.min(amountPaid, existing.total);
    const paymentStatus = derivePaymentStatus(capped, existing.total);

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE orders
            SET payment_method = $1,
                amount_paid    = $2,
                payment_status = $3,
                updated_at     = now()
          WHERE id = $4`,
        [paymentMethod, capped, paymentStatus, existing.id]
      );

      if (existing.status === "Completed" && paymentStatus === "Paid") {
        await awardLoyaltyForOrder(
          client,
          { ...existing, paymentStatus },
          req.user?.id ?? null
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const order = await fetchOrder(existing.id);
    res.json({ message: "Payment updated", order });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/orders/:id/cancel                                         */
/* ------------------------------------------------------------------ */

exports.cancel = async (req, res) => {
  try {
    const existing = await fetchOrder(req.params.id);
    if (!existing) return notFound(res);

    if (existing.status === "Reversed") {
      return res.status(409).json({
        message: "A reversed order cannot be cancelled",
      });
    }

    if (existing.status === "Cancelled") {
      return res.json({ message: "Order already cancelled", order: existing });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        "UPDATE orders SET status = 'Cancelled', updated_at = now() WHERE id = $1",
        [existing.id]
      );

      await restoreStock(client, existing.id, req.user?.id ?? null);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const order = await fetchOrder(existing.id);
    res.json({ message: "Order cancelled", order });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* DELETE /api/orders/:id — admin-only hard delete                     */
/* ------------------------------------------------------------------ */

exports.remove = async (req, res) => {
  try {
    const existing = await fetchOrder(req.params.id);
    if (!existing) return notFound(res);

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Live sales still hold stock; restore before erasing the order so
      // inventory stays accurate. Cancelled/Reversed already returned units.
      if (!CLOSED_STATUSES.includes(existing.status)) {
        await restoreStock(client, existing.id, req.user?.id ?? null);
      }

      await client.query("DELETE FROM order_reversals WHERE order_id = $1", [
        existing.id,
      ]);
      await client.query(
        "UPDATE loyalty_entries SET order_id = NULL WHERE order_id = $1",
        [existing.id]
      );
      await client.query("DELETE FROM order_items WHERE order_id = $1", [
        existing.id,
      ]);
      const deleted = await client.query(
        "DELETE FROM orders WHERE id = $1 RETURNING id, order_number",
        [existing.id]
      );

      if (!deleted.rowCount) {
        await client.query("ROLLBACK");
        return notFound(res);
      }

      await client.query("COMMIT");

      res.json({
        message: "Order deleted",
        order: {
          id: deleted.rows[0].id,
          orderNumber: deleted.rows[0].order_number,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    serverError(res, error);
  }
};

exports.CONSTANTS = { CHANNELS, STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES };
