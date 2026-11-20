const db = require("../config/db");
const { badRequest, serverError, round2 } = require("../helpers/http");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Inclusive day range turned into a half-open timestamp window, which is the
 * same shape the shift report uses so the two never disagree about a sale
 * that landed at midnight.
 */
function windowOf(query) {
  const to = DATE_RE.test(query.dateTo ?? "")
    ? query.dateTo
    : new Date().toISOString().slice(0, 10);

  const from = DATE_RE.test(query.dateFrom ?? "")
    ? query.dateFrom
    : new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000)
        .toISOString()
        .slice(0, 10);

  if (Date.parse(from) > Date.parse(to)) {
    return { error: "The start date is after the end date." };
  }

  return { from, to, params: [from, to] };
}

/* Sales exclude Cancelled and Reversed orders, matching shiftController. */
const SALES = `
  SELECT
    count(*) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed'))::int AS orders,
    COALESCE(sum(o.total) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed')), 0) AS sales,
    COALESCE(sum(o.amount_paid) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed')), 0) AS collected,
    COALESCE(sum(o.total - o.amount_paid) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed')), 0) AS outstanding,
    COALESCE(sum(o.tax_amount) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed')), 0) AS tax,
    count(*) FILTER (WHERE o.status = 'Cancelled')::int AS cancelled,
    count(*) FILTER (WHERE o.status = 'Reversed')::int  AS reversed,
    COALESCE(sum(o.total) FILTER (WHERE o.status = 'Cancelled'), 0) AS cancelled_value,
    COALESCE(sum(o.total) FILTER (WHERE o.status = 'Reversed'), 0)  AS reversed_value
  FROM orders o
  WHERE o.created_at >= $1::date AND o.created_at < $2::date + interval '1 day'
`;

const BY_PAYMENT = `
  SELECT o.payment_method AS key,
         count(*)::int AS orders,
         COALESCE(sum(o.total), 0) AS sales
    FROM orders o
   WHERE o.created_at >= $1::date AND o.created_at < $2::date + interval '1 day'
     AND o.status NOT IN ('Cancelled','Reversed')
   GROUP BY o.payment_method
   ORDER BY sales DESC
`;

const BY_CHANNEL = `
  SELECT o.channel AS key,
         count(*)::int AS orders,
         COALESCE(sum(o.total), 0) AS sales
    FROM orders o
   WHERE o.created_at >= $1::date AND o.created_at < $2::date + interval '1 day'
     AND o.status NOT IN ('Cancelled','Reversed')
   GROUP BY o.channel
   ORDER BY sales DESC
`;

const DAILY = `
  SELECT to_char(date_trunc('day', o.created_at), 'YYYY-MM-DD') AS date,
         count(*)::int AS orders,
         COALESCE(sum(o.total), 0) AS sales
    FROM orders o
   WHERE o.created_at >= $1::date AND o.created_at < $2::date + interval '1 day'
     AND o.status NOT IN ('Cancelled','Reversed')
   GROUP BY 1
   ORDER BY 1
`;

const TOP_PRODUCTS = `
  SELECT oi.product_name AS name,
         sum(oi.quantity)::int AS quantity,
         COALESCE(sum(oi.line_total), 0) AS revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
   WHERE o.created_at >= $1::date AND o.created_at < $2::date + interval '1 day'
     AND o.status NOT IN ('Cancelled','Reversed')
   GROUP BY oi.product_name
   ORDER BY revenue DESC
   LIMIT 10
`;

const BY_CATEGORY = `
  SELECT COALESCE(c.name, oi.category, 'Unassigned') AS name,
         COALESCE(sum(oi.line_total), 0) AS revenue,
         sum(oi.quantity)::int AS quantity
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
   WHERE o.created_at >= $1::date AND o.created_at < $2::date + interval '1 day'
     AND o.status NOT IN ('Cancelled','Reversed')
   GROUP BY 1
   ORDER BY revenue DESC
`;

const BY_STAFF = `
  SELECT COALESCE(u.display_name, 'Unattributed') AS name,
         count(o.id)::int AS orders,
         COALESCE(sum(o.total) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed')), 0) AS sales
    FROM orders o
    LEFT JOIN users u ON u.id = o.created_by
   WHERE o.created_at >= $1::date AND o.created_at < $2::date + interval '1 day'
   GROUP BY 1
   ORDER BY sales DESC
`;

const SHIFTS = `
  SELECT count(*)::int AS shifts,
         COALESCE(sum(cash_pull_total), 0) AS pulls,
         COALESCE(sum(difference), 0) AS variance,
         count(*) FILTER (WHERE difference IS NOT NULL AND abs(difference) > 0.005)::int AS variances
    FROM (
      SELECT s.difference,
             COALESCE((SELECT sum(cp.amount) FROM cash_pulls cp WHERE cp.shift_id = s.id), 0) AS cash_pull_total
        FROM shifts s
       WHERE s.opened_at >= $1::date AND s.opened_at < $2::date + interval '1 day'
    ) s
`;

const REVERSALS = `
  SELECT count(*)::int AS count,
         COALESCE(sum(r.amount), 0) AS value,
         COALESCE(string_agg(DISTINCT split_part(r.reason, '(', 1), ', '), '') AS reasons
    FROM order_reversals r
   WHERE r.created_at >= $1::date AND r.created_at < $2::date + interval '1 day'
`;

exports.overview = async (req, res) => {
  try {
    const range = windowOf(req.query ?? {});
    if (range.error) return badRequest(res, range.error);

    const [sales, payment, channel, daily, products, categories, staff, shifts, reversals] =
      await Promise.all([
        db.query(SALES, range.params),
        db.query(BY_PAYMENT, range.params),
        db.query(BY_CHANNEL, range.params),
        db.query(DAILY, range.params),
        db.query(TOP_PRODUCTS, range.params),
        db.query(BY_CATEGORY, range.params),
        db.query(BY_STAFF, range.params),
        db.query(SHIFTS, range.params),
        db.query(REVERSALS, range.params),
      ]);

    const s = sales.rows[0];

    res.json({
      range: { from: range.from, to: range.to },
      summary: {
        orders: s.orders,
        sales: round2(s.sales),
        collected: round2(s.collected),
        outstanding: round2(s.outstanding),
        tax: round2(s.tax),
        averageOrder: s.orders > 0 ? round2(Number(s.sales) / s.orders) : 0,
        cancelled: s.cancelled,
        reversed: s.reversed,
        cancelledValue: round2(s.cancelled_value),
        reversedValue: round2(s.reversed_value),
      },
      byPaymentMethod: payment.rows.map((r) => ({ ...r, sales: round2(r.sales) })),
      byChannel: channel.rows.map((r) => ({ ...r, sales: round2(r.sales) })),
      daily: daily.rows.map((r) => ({ ...r, sales: round2(r.sales) })),
      topProducts: products.rows.map((r) => ({ ...r, revenue: round2(r.revenue) })),
      byCategory: categories.rows.map((r) => ({ ...r, revenue: round2(r.revenue) })),
      byStaff: staff.rows.map((r) => ({ ...r, sales: round2(r.sales) })),
      shifts: {
        ...shifts.rows[0],
        pulls: round2(shifts.rows[0].pulls),
        variance: round2(shifts.rows[0].variance),
      },
      reversals: {
        ...reversals.rows[0],
        value: round2(reversals.rows[0].value),
      },
    });
  } catch (error) {
    serverError(res, error);
  }
};
