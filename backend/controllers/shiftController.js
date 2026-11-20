const db = require("../config/db");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_STATUSES = ["Open", "Closed"];

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

const round = (value) => Math.round(toNumber(value) * 100) / 100;

/**
 * A shift is attributed by cashier and by clock: only orders rung on that
 * account inside that window count towards it. Orders without an author fall
 * back into every shift of the window, which is what the IS NULL branch allows.
 */
const ORDER_WINDOW = `
  o.created_at >= sh.opened_at
  AND o.created_at < COALESCE(sh.closed_at, now())
  AND (sh.employee_id IS NULL OR o.created_by = sh.employee_id)
`;

const REVERSAL_WINDOW = `
  r.created_at >= sh.opened_at
  AND r.created_at <= COALESCE(sh.closed_at, now())
  AND (sh.employee_id IS NULL OR r.performed_by = sh.employee_id)
`;

/* Sales exclude Cancelled and Reversed orders, but cash_received keeps a
   reversed sale's money in: the drawer really did take it, and the refund is
   subtracted once more through cash_refunded, so netting stays correct. */
const SALES_AGGREGATES = `
  SELECT
    count(*)::int AS booked_orders,
    count(*) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed'))::int AS order_count,
    COALESCE(sum(o.total) FILTER (WHERE o.status NOT IN ('Cancelled','Reversed')), 0) AS total_sales,
    COALESCE(sum(o.total) FILTER (
      WHERE o.payment_method = 'Cash' AND o.status NOT IN ('Cancelled','Reversed')
    ), 0) AS cash_sales,
    COALESCE(sum(o.total) FILTER (
      WHERE o.payment_method = 'Card' AND o.status NOT IN ('Cancelled','Reversed')
    ), 0) AS card_sales,
    COALESCE(sum(o.total) FILTER (
      WHERE o.payment_method = 'Online' AND o.status NOT IN ('Cancelled','Reversed')
    ), 0) AS online_sales,
    COALESCE(sum(o.total) FILTER (
      WHERE o.payment_method = 'Foodpanda' AND o.status NOT IN ('Cancelled','Reversed')
    ), 0) AS aggregator_sales,
    COALESCE(sum(o.amount_paid) FILTER (
      WHERE o.payment_method = 'Cash' AND o.status <> 'Cancelled'
    ), 0) AS cash_received,
    COALESCE(sum(o.total - o.amount_paid) FILTER (
      WHERE o.status NOT IN ('Cancelled','Reversed')
    ), 0) AS outstanding,
    count(*) FILTER (WHERE o.status = 'Cancelled')::int AS cancelled_orders,
    count(*) FILTER (WHERE o.status = 'Reversed')::int  AS reversed_orders,
    count(*) FILTER (WHERE o.status = 'Completed')::int AS completed_orders
  FROM orders o
  WHERE ${ORDER_WINDOW}
`;

const REVERSAL_AGGREGATES = `
  SELECT count(*)::int AS reversal_count,
         COALESCE(sum(r.amount), 0) AS reversed_value,
         COALESCE(sum(r.amount_paid) FILTER (WHERE r.payment_method = 'Cash'), 0) AS cash_refunded
    FROM order_reversals r
   WHERE ${REVERSAL_WINDOW}
`;

const PULL_AGGREGATES = `
  SELECT count(*)::int AS pull_count,
         COALESCE(sum(cp.amount), 0) AS pull_total
    FROM cash_pulls cp
   WHERE cp.shift_id = sh.id
`;

function mapShift(row) {
  const openingCash = round(row.opening_cash);
  const cashReceived = round(row.cash_received);
  const cashRefunded = round(row.cash_refunded);
  const pulls = round(row.pull_total);

  const expectedCash = round(
    row.expected_cash ??
      openingCash + cashReceived - cashRefunded - pulls
  );

  const closingCash =
    row.closing_cash === null || row.closing_cash === undefined
      ? null
      : round(row.closing_cash);

  return {
    id: row.id,
    shiftNumber: row.shift_number,
    status: row.status,
    branchId: row.branch_id,
    branchName: row.branch_name || "Branch",
    employeeId: row.employee_id,
    employeeName: row.employee_name || "Unassigned",
    employeeRole: row.employee_role || "",
    openingCash,
    closingCash,
    expectedCash,
    difference:
      closingCash === null
        ? null
        : round(row.difference ?? closingCash - expectedCash),
    notes: row.notes || "",
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    closingReport: row.closing_report || null,
    totals: {
      bookedOrders: row.booked_orders,
      orderCount: row.order_count,
      completedOrders: row.completed_orders || 0,
      totalSales: round(row.total_sales),
      cashSales: round(row.cash_sales),
      cardSales: round(row.card_sales),
      onlineSales: round(row.online_sales),
      aggregatorSales: round(row.aggregator_sales),
      cashReceived,
      outstanding: round(row.outstanding),
      cancelledOrders: row.cancelled_orders,
      reversedOrders: row.reversed_orders,
      reversalCount: row.reversal_count,
      reversedValue: round(row.reversed_value),
      cashRefunded,
      pullCount: row.pull_count,
      pullTotal: pulls,
      expenses: pulls,
      refunds: round(row.reversed_value),
      netRevenue: round(row.total_sales - row.reversed_value - pulls),
    },
  };
}

async function findShift(id) {
  const result = await db.query(
    `SELECT sh.*,
            b.name AS branch_name,
            e.display_name AS employee_name,
            e.role AS employee_role,
            sa.* ,
            rv.reversal_count, rv.reversed_value, rv.cash_refunded,
            pa.pull_count, pa.pull_total
       FROM shifts sh
       JOIN branches b ON b.id = sh.branch_id
       LEFT JOIN users e ON e.id = sh.employee_id
       LEFT JOIN LATERAL (${SALES_AGGREGATES}) sa ON TRUE
       LEFT JOIN LATERAL (${REVERSAL_AGGREGATES}) rv ON TRUE
       LEFT JOIN LATERAL (${PULL_AGGREGATES}) pa ON TRUE
      WHERE sh.id = $1`,
    [id]
  );

  return result.rows[0] ? mapShift(result.rows[0]) : null;
}

/* ------------------------------------------------------------------ */
/* GET /api/shifts/options — filter data                               */
/* ------------------------------------------------------------------ */

exports.options = async (req, res) => {
  try {
    const [branches, employees] = await Promise.all([
      db.query(
        "SELECT id, name, address FROM branches WHERE is_active ORDER BY name"
      ),
      db.query(
        "SELECT id, display_name AS name, role, can_reverse FROM users ORDER BY id"
      ),
    ]);

    res.json({
      branches: branches.rows,
      employees: employees.rows,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/shifts — shift log                                         */
/* ------------------------------------------------------------------ */

exports.list = async (req, res) => {
  try {
    const params = [];
    const where = [];

    const add = (clause, value) => {
      params.push(value);
      where.push(clause.replace("?", `$${params.length}`));
    };

    const q = String(req.query.q ?? "").trim();
    if (q) {
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      where.push(
        `(sh.shift_number ILIKE $${params.length - 2} ` +
          `OR e.display_name ILIKE $${params.length - 1} ` +
          `OR b.name ILIKE $${params.length})`
      );
    }

    const branchId = String(req.query.branchId ?? "").trim();
    if (branchId) {
      const n = Math.trunc(Number(branchId));
      if (!Number.isFinite(n) || n < 1) return badRequest(res, "Unknown branch");
      add("sh.branch_id = ?", n);
    }

    const employeeId = String(req.query.employeeId ?? "").trim();
    if (employeeId) {
      const n = Math.trunc(Number(employeeId));
      if (!Number.isFinite(n) || n < 1) {
        return badRequest(res, "Unknown employee");
      }
      add("sh.employee_id = ?", n);
    }

    const status = String(req.query.status ?? "").trim();
    if (status) {
      if (!SHIFT_STATUSES.includes(status)) {
        return badRequest(res, "Unknown shift status");
      }
      add("sh.status = ?", status);
    }

    if (req.user.role !== "admin" || String(req.query.mine ?? "") === "true") {
      add("sh.employee_id = ?", req.user.id);
    }

    const dateFrom = String(req.query.dateFrom ?? "").trim();
    if (dateFrom) {
      if (!DATE_RE.test(dateFrom)) {
        return badRequest(res, "dateFrom must be YYYY-MM-DD");
      }
      add("sh.opened_at >= ?::date", dateFrom);
    }

    const dateTo = String(req.query.dateTo ?? "").trim();
    if (dateTo) {
      if (!DATE_RE.test(dateTo)) {
        return badRequest(res, "dateTo must be YYYY-MM-DD");
      }
      add("sh.opened_at < (?::date + 1)", dateTo);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countResult = await db.query(
      `SELECT count(*)::int AS total,
              COALESCE(sum(sh.opening_cash), 0) AS opening_total
         FROM shifts sh
         JOIN branches b ON b.id = sh.branch_id
         LEFT JOIN users e ON e.id = sh.employee_id
        ${whereSql}`,
      params
    );

    const listParams = [...params, limit, offset];
    const result = await db.query(
      `SELECT sh.*,
              b.name AS branch_name,
              e.display_name AS employee_name,
              e.role AS employee_role,
              sa.*,
              rv.reversal_count, rv.reversed_value, rv.cash_refunded,
              pa.pull_count, pa.pull_total
         FROM shifts sh
         JOIN branches b ON b.id = sh.branch_id
         LEFT JOIN users e ON e.id = sh.employee_id
         LEFT JOIN LATERAL (${SALES_AGGREGATES}) sa ON TRUE
         LEFT JOIN LATERAL (${REVERSAL_AGGREGATES}) rv ON TRUE
         LEFT JOIN LATERAL (${PULL_AGGREGATES}) pa ON TRUE
        ${whereSql}
        ORDER BY sh.opened_at DESC, sh.id DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      shifts: result.rows.map(mapShift),
      total: countResult.rows[0].total,
      openingCashTotal: round(countResult.rows[0].opening_total),
      limit,
      offset,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/shifts/current — this cashier's running shift              */
/* ------------------------------------------------------------------ */

exports.current = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id FROM shifts WHERE employee_id = $1 AND status = 'Open' LIMIT 1",
      [req.user.id]
    );

    if (!result.rows[0]) return res.json({ shift: null });

    res.json({ shift: await findShift(result.rows[0].id) });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* GET /api/shifts/:id — full shift report                             */
/* ------------------------------------------------------------------ */

exports.getOne = async (req, res) => {
  try {
    const shift = await findShift(req.params.id);

    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }
    if (req.user.role !== "admin" && Number(shift.employeeId) !== Number(req.user.id)) {
      return res.status(404).json({ message: "Shift not found" });
    }

    const pulls = await db.query(
      `SELECT cp.id, cp.amount, cp.reason, cp.notes, cp.created_at,
              cp.shift_id, u.display_name AS employee_name
         FROM cash_pulls cp
         LEFT JOIN users u ON u.id = cp.pulled_by
        WHERE cp.shift_id = $1
        ORDER BY cp.created_at DESC, cp.id DESC`,
      [shift.id]
    );

    res.json({
      shift,
      cashPulls: pulls.rows.map((row) => ({
        id: row.id,
        amount: round(row.amount),
        reason: row.reason,
        notes: row.notes || "",
        employeeName: row.employee_name || "Unknown user",
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/shifts — open a shift                                     */
/* ------------------------------------------------------------------ */

exports.open = async (req, res) => {
  try {
    const body = req.body ?? {};

    const rawOpening = body.openingCash;

    if (rawOpening !== undefined && toNumber(rawOpening) < 0) {
      return badRequest(res, "Opening cash cannot be negative");
    }

    const openingCash = Math.max(0, round(rawOpening ?? 0));

    const branchId = Math.trunc(toNumber(body.branchId)) || null;

    const branch = branchId
      ? await db.query(
          "SELECT id FROM branches WHERE id = $1 AND is_active",
          [branchId]
        )
      : await db.query(
          "SELECT id FROM branches WHERE is_active ORDER BY id LIMIT 1"
        );

    if (!branch.rows[0]) return badRequest(res, "Unknown branch");

    const running = await db.query(
      `SELECT sh.shift_number FROM shifts sh
        WHERE sh.employee_id = $1 AND sh.status = 'Open'
        ORDER BY sh.opened_at DESC LIMIT 1`,
      [req.user.id]
    );

    if (running.rows[0]) {
      return res.status(409).json({
        message: `${running.rows[0].shift_number} is still open for you`,
      });
    }

    const result = await db.query(
      `INSERT INTO shifts
         (shift_number, branch_id, employee_id, status, opening_cash, notes)
       VALUES (
         'SH-' || to_char(now(), 'YYMMDD') || '-' ||
           lpad(nextval('shift_number_seq')::text, 5, '0'),
         $1, $2, 'Open', $3, $4
       )
       RETURNING id`,
      [
        branch.rows[0].id,
        req.user.id,
        openingCash,
        String(body.notes ?? "").trim().slice(0, 500) || null,
      ]
    );

    res.status(201).json({
      message: "Shift started",
      shift: await findShift(result.rows[0].id),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "You already have a shift open on another terminal",
      });
    }

    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* PATCH /api/shifts/:id/close                                         */
/* ------------------------------------------------------------------ */

exports.close = async (req, res) => {
  try {
    const body = req.body ?? {};

    const shift = await findShift(req.params.id);

    if (!shift) return res.status(404).json({ message: "Shift not found" });

    if (req.user.role !== "admin" && Number(shift.employeeId) !== Number(req.user.id)) {
      return res.status(403).json({ message: "You can only end your own shift." });
    }

    if (shift.status !== "Open") {
      return res.status(409).json({
        message: `${shift.shiftNumber} was closed ${shift.closedAt ? "already" : "earlier"}`,
      });
    }

    if (body.closingCash === undefined || String(body.closingCash).trim() === "") {
      return badRequest(res, "Count the drawer and enter the actual cash");
    }

    const closingCash = round(body.closingCash);

    if (closingCash < 0) {
      return badRequest(res, "Actual cash cannot be negative");
    }

    const totals = shift.totals;
    const expectedCash =
      shift.openingCash +
      totals.cashReceived -
      totals.cashRefunded -
      totals.pullTotal;
    const difference = round(closingCash - expectedCash);
    const notes = String(body.notes ?? "").trim().slice(0, 500) || null;

    const denominations = Array.isArray(body.denominations)
      ? body.denominations
          .map((row) => ({
            value: round(row?.value),
            count: Math.max(0, Math.trunc(Number(row?.count) || 0)),
          }))
          .filter((row) => row.value > 0)
      : [];

    const denominationTotal = round(
      denominations.reduce((sum, row) => sum + row.value * row.count, 0)
    );

    const closedAt = new Date().toISOString();
    const durationMs = Math.max(
      0,
      new Date(closedAt).getTime() - new Date(shift.openedAt).getTime()
    );

    const closingReport = {
      generatedAt: closedAt,
      shiftNumber: shift.shiftNumber,
      employeeName: shift.employeeName,
      employeeId: shift.employeeId,
      openedAt: shift.openedAt,
      closedAt,
      durationMs,
      openingCash: shift.openingCash,
      expectedCash: round(expectedCash),
      closingCash,
      difference,
      denominations,
      denominationTotal,
      notes,
      totals: {
        ...totals,
        expenses: totals.pullTotal,
        refunds: totals.reversedValue,
        netRevenue: round(
          totals.totalSales - totals.reversedValue - totals.pullTotal
        ),
        onlineSales:
          round(totals.onlineSales + totals.aggregatorSales),
      },
    };

    await db.query(
      `UPDATE shifts
          SET status          = 'Closed',
              closing_cash    = $1,
              expected_cash   = $2,
              difference      = $3,
              notes           = COALESCE($4, notes),
              closing_report  = $5::jsonb,
              closed_at       = now()
        WHERE id = $6 AND status = 'Open'`,
      [
        closingCash,
        round(expectedCash),
        difference,
        notes,
        JSON.stringify(closingReport),
        shift.id,
      ]
    );

    const closedShift = await findShift(shift.id);
    try {
      await require("../services/emailNotifications").awaitShiftClosed(
        closedShift,
        closingReport
      );
    } catch (emailError) {
      console.error("[email] Failed to send shift notification:", emailError.message);
    }

    res.json({
      message: `${shift.shiftNumber} closed`,
      shift: closedShift,
      closingReport,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/shifts/:id/cash-pulls                                     */
/* ------------------------------------------------------------------ */

exports.addCashPull = async (req, res) => {
  try {
    const body = req.body ?? {};

    const shift = await findShift(req.params.id);

    if (!shift) return res.status(404).json({ message: "Shift not found" });

    if (req.user.role !== "admin" && Number(shift.employeeId) !== Number(req.user.id)) {
      return res.status(404).json({ message: "Shift not found" });
    }

    if (shift.status !== "Open") {
      return res
        .status(409)
        .json({ message: "Cash can only be pulled from an open shift" });
    }

    const amount = round(body.amount);

    if (!(amount > 0)) {
      return badRequest(res, "A cash pull needs an amount above zero");
    }

    const reason = String(body.reason ?? "").trim();

    if (reason.length < 3) {
      return badRequest(res, "Say why the cash left the drawer");
    }

    const result = await db.query(
      `INSERT INTO cash_pulls (shift_id, amount, reason, notes, pulled_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        shift.id,
        amount,
        reason.slice(0, 160),
        String(body.notes ?? "").trim().slice(0, 500) || null,
        req.user.id,
      ]
    );

    const stored = await db.query(
      `SELECT cp.id, cp.amount, cp.reason, cp.notes, cp.created_at,
              u.display_name AS employee_name
         FROM cash_pulls cp
         LEFT JOIN users u ON u.id = cp.pulled_by
        WHERE cp.id = $1`,
      [result.rows[0].id]
    );

    const row = stored.rows[0];

    res.status(201).json({
      message: `Cash pull of ${amount} recorded`,
      pull: {
        id: row.id,
        amount: round(row.amount),
        reason: row.reason,
        notes: row.notes || "",
        employeeName: row.employee_name || "Unknown user",
        createdAt: row.created_at,
      },
      shift: await findShift(shift.id),
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.CONSTANTS = { SHIFT_STATUSES };
