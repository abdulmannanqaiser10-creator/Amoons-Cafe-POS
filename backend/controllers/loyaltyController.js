const db = require("../config/db");
const {
  badRequest,
  notFound,
  conflict,
  serverError,
  databaseProblem,
  text,
} = require("../helpers/http");

const REASONS = ["Earn", "Redeem", "Adjustment"];

const MEMBER_SQL = `
  SELECT m.id,
         m.name,
         m.phone,
         m.email,
         m.points,
         m.created_at AS "createdAt",
         (SELECT COUNT(*)::int FROM loyalty_entries e WHERE e.member_id = m.id) AS "entryCount",
         (SELECT MAX(e.created_at) FROM loyalty_entries e WHERE e.member_id = m.id) AS "lastActivity"
    FROM loyalty_members m
`;

/**
 * Recent Redeem ledger rows for the Rewards admin page.
 */
exports.redemptions = async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id,
              e.points,
              e.note,
              e.created_at AS "createdAt",
              m.id AS "memberId",
              m.name AS "memberName",
              m.phone AS "memberPhone",
              o.order_number AS "orderNumber",
              u.display_name AS "performedByName"
         FROM loyalty_entries e
         JOIN loyalty_members m ON m.id = e.member_id
         LEFT JOIN orders o ON o.id = e.order_id
         LEFT JOIN users u ON u.id = e.performed_by
        WHERE e.reason = 'Redeem'
        ORDER BY e.created_at DESC
        LIMIT 100`
    );

    res.json({ redemptions: result.rows });
  } catch (error) {
    serverError(res, error);
  }
};

/**
 * Till lookup: match a loyalty member by phone digits so the Current Order
 * panel can show the customer name and available points.
 */
exports.lookupByPhone = async (req, res) => {
  try {
    const digits = String(req.query.phone ?? "").replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      return res.json({ member: null });
    }

    const result = await db.query(
      `${MEMBER_SQL}
        WHERE regexp_replace(m.phone, '\\D', '', 'g') = $1
        LIMIT 1`,
      [digits]
    );

    res.json({ member: result.rows[0] || null });
  } catch (error) {
    serverError(res, error);
  }
};

exports.list = async (req, res) => {
  try {
    const params = [];
    const where = [];

    if (req.query.q) {
      params.push(`%${String(req.query.q).trim().toLowerCase()}%`);
      where.push(`(lower(m.name) LIKE $1 OR replace(m.phone, ' ', '') LIKE replace($1, '%', ''))`);
    }

    const result = await db.query(
      `${MEMBER_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY m.points DESC, m.name`,
      params
    );

    const totals = await db.query(
      `SELECT COUNT(*)::int AS members,
              COALESCE(SUM(points), 0)::int AS outstanding,
              (SELECT COUNT(*)::int FROM loyalty_members
                WHERE created_at >= date_trunc('day', now())) AS "newToday"
         FROM loyalty_members`
    );

    res.json({
      members: result.rows,
      totals: totals.rows[0],
      reasons: REASONS,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.create = async (req, res) => {
  try {
    const name = text(req.body?.name, 120);
    const phone = text(req.body?.phone, 40);

    const problems = [];
    if (!name) problems.push("Member name is required.");
    const digits = phone ? phone.replace(/\D/g, "") : "";
    if (!phone || digits.length < 10 || digits.length > 15) {
      problems.push("A phone number of 10–15 digits is required.");
    }

    const opening = Math.trunc(Number(req.body?.openingPoints) || 0);
    if (opening < 0) problems.push("Opening points cannot be negative.");

    if (problems.length) return badRequest(res, problems.join(" "));

    const result = await db.query(
      `INSERT INTO loyalty_members (name, phone, email, points)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name, phone, text(req.body?.email, 160), opening]
    );

    if (opening > 0) {
      await db.query(
        `INSERT INTO loyalty_entries (member_id, points, reason, note, performed_by)
         VALUES ($1, $2, 'Adjustment', 'Opening balance', $3)`,
        [result.rows[0].id, opening, req.user?.id ?? null]
      );
    }

    const member = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [
      result.rows[0].id,
    ]);

    res.status(201).json({ message: `${name} enrolled`, member: member.rows[0] });
  } catch (error) {
    const problem = databaseProblem(error, {
      unique: { phone: "A member with that phone number already exists." },
    });
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown member.");

    const name = text(req.body?.name, 120);
    const phone = text(req.body?.phone, 40);

    if (!name) return badRequest(res, "Member name is required.");
    const digits = phone ? phone.replace(/\D/g, "") : "";
    if (!phone || digits.length < 10 || digits.length > 15) {
      return badRequest(res, "A phone number of 10–15 digits is required.");
    }

    const result = await db.query(
      `UPDATE loyalty_members
          SET name = $1, phone = $2, email = $3, updated_at = now()
        WHERE id = $4
        RETURNING id`,
      [name, phone, text(req.body?.email, 160), id]
    );

    if (!result.rowCount) return notFound(res, "That member no longer exists.");

    const member = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [id]);

    res.json({ message: "Member details updated", member: member.rows[0] });
  } catch (error) {
    const problem = databaseProblem(error, {
      unique: { phone: "A member with that phone number already exists." },
    });
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

exports.detail = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown member.");

    const member = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [id]);
    if (!member.rowCount) return notFound(res, "That member no longer exists.");

    const entries = await db.query(
      `SELECT e.id, e.points, e.reason, e.note, e.created_at AS "createdAt",
              u.display_name AS "performedByName",
              o.order_number AS "orderNumber"
         FROM loyalty_entries e
         LEFT JOIN users u ON u.id = e.performed_by
         LEFT JOIN orders o ON o.id = e.order_id
        WHERE e.member_id = $1
        ORDER BY e.created_at DESC
        LIMIT 200`,
      [id]
    );

    res.json({ member: member.rows[0], entries: entries.rows });
  } catch (error) {
    serverError(res, error);
  }
};

/**
 * The balance and its ledger row are written in one transaction with the row
 * locked, so two clerks editing the same member cannot both pass the
 * "not enough points" check and leave the balance negative.
 */
exports.addEntry = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown member.");

    const points = Math.trunc(Number(req.body?.points));
    if (!Number.isFinite(points) || points === 0) {
      return badRequest(res, "Enter the points to add or remove.");
    }

    const reason = String(req.body?.reason ?? "Adjustment");
    if (!REASONS.includes(reason)) return badRequest(res, "Unknown points reason.");

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const member = await client.query(
        "SELECT id, name, points FROM loyalty_members WHERE id = $1 FOR UPDATE",
        [id]
      );

      if (!member.rowCount) {
        await client.query("ROLLBACK");
        return notFound(res, "That member no longer exists.");
      }

      const balance = member.rows[0].points + points;

      if (balance < 0) {
        await client.query("ROLLBACK");
        return conflict(
          res,
          `${member.rows[0].name} only has ${member.rows[0].points} points.`
        );
      }

      await client.query(
        "UPDATE loyalty_members SET points = $1, updated_at = now() WHERE id = $2",
        [balance, id]
      );

      await client.query(
        `INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          points,
          reason,
          text(req.body?.note, 300),
          Number.isInteger(Number(req.body?.orderId))
            ? Number(req.body.orderId)
            : null,
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
      message: `${points > 0 ? "Added" : "Removed"} ${Math.abs(points)} points`,
      member: updated.rows[0],
    });
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown member.");

    const result = await db.query("DELETE FROM loyalty_members WHERE id = $1", [id]);

    if (!result.rowCount) return notFound(res, "That member no longer exists.");

    res.json({ message: "Member removed with their points history" });
  } catch (error) {
    serverError(res, error);
  }
};
