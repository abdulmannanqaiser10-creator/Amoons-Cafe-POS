const db = require("../config/db");
const bcrypt = require("bcryptjs");
const {
  badRequest,
  notFound,
  serverError,
  databaseProblem,
  text,
} = require("../helpers/http");

const ROLES = ["staff", "admin"];
const PIN_SALT_ROUNDS = 10;

const STAFF_SQL = `
  SELECT u.id,
         u.display_name AS name,
         u.role,
         u.can_reverse  AS "canReverse",
         u.is_active    AS "isActive",
         u.phone,
         u.email,
         u.created_at   AS "createdAt",
         (SELECT COUNT(*)::int FROM orders o WHERE o.created_by = u.id) AS "orderCount",
         (SELECT COUNT(*)::int FROM shifts s WHERE s.employee_id = u.id) AS "shiftCount"
    FROM users u
`;

const validPin = (pin) => /^\d{5}$/.test(String(pin ?? "").trim());

async function pinAlreadyUsed(pin, exceptId = null) {
  const result = await db.query(
    `SELECT id, pin_hash FROM users
      WHERE ($1::int IS NULL OR id <> $1)`,
    [exceptId]
  );

  for (const account of result.rows) {
    if (await bcrypt.compare(pin, account.pin_hash)) return true;
  }

  return false;
}

exports.list = async (req, res) => {
  try {
    const result = await db.query(`${STAFF_SQL} ORDER BY u.display_name`);

    res.json({ staff: result.rows, roles: ROLES });
  } catch (error) {
    serverError(res, error);
  }
};

exports.create = async (req, res) => {
  try {
    const name = text(req.body?.name, 120);
    const pin = String(req.body?.pin ?? "").trim();
    const role = String(req.body?.role ?? "staff");

    const problems = [];

    if (!name) problems.push("Staff name is required.");
    if (!validPin(pin)) problems.push("PIN must be exactly 5 digits.");
    if (!ROLES.includes(role)) problems.push("Role must be staff or manager.");

    if (problems.length) return badRequest(res, problems.join(" "));
    if (await pinAlreadyUsed(pin)) {
      return res.status(409).json({ message: "That PIN is already assigned to another account." });
    }

    const canReverse =
      role === "admin" ? req.body?.canReverse !== false : req.body?.canReverse === true;

    const hash = await bcrypt.hash(pin, PIN_SALT_ROUNDS);

    const result = await db.query(
      `INSERT INTO users
         (pin_hash, role, display_name, can_reverse, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        hash,
        role,
        name,
        canReverse,
        text(req.body?.phone, 40),
        text(req.body?.email, 160),
      ]
    );

    const staff = await db.query(`${STAFF_SQL} WHERE u.id = $1`, [
      result.rows[0].id,
    ]);

    res.status(201).json({
      message: `${name} can now sign in with their PIN`,
      staff: staff.rows[0],
    });
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown staff account.");

    const existing = await db.query(
      "SELECT id, role, is_active, phone, email FROM users WHERE id = $1",
      [id]
    );

    if (!existing.rowCount) return notFound(res, "That account no longer exists.");

    const name = text(req.body?.name, 120);
    const role = String(req.body?.role ?? existing.rows[0].role);

    // A caller that only wants to reset a PIN (the Business Settings panel)
    // omits contact fields entirely; omitting means "leave as it is", while
    // sending an empty string still clears them.
    const body = req.body ?? {};
    const hasPhone = Object.prototype.hasOwnProperty.call(body, "phone");
    const hasEmail = Object.prototype.hasOwnProperty.call(body, "email");
    const phone = hasPhone ? text(body.phone, 40) : existing.rows[0].phone;
    const email = hasEmail ? text(body.email, 160) : existing.rows[0].email;

    const problems = [];
    if (!name) problems.push("Staff name is required.");
    if (!ROLES.includes(role)) problems.push("Role must be staff or manager.");

    // Locking the last manager out of the only manager account would end the
    // panel for everyone, so both moves need a replacement already in place.
    const demoting = existing.rows[0].role === "admin" && role !== "admin";
    const deactivating =
      existing.rows[0].is_active && req.body?.isActive === false;

    if (demoting || deactivating) {
      const others = await db.query(
        `SELECT COUNT(*)::int AS n FROM users
          WHERE role = 'admin' AND is_active = true AND id <> $1`,
        [id]
      );

      if (others.rows[0].n === 0) {
        problems.push(
          deactivating
            ? "This is the last active manager — promote someone else first."
            : "This is the only manager account — promote someone else first."
        );
      }
    }

    if (problems.length) return badRequest(res, problems.join(" "));

    const canReverse =
      role === "admin"
        ? req.body?.canReverse !== false
        : req.body?.canReverse === true;

    // Omitting the flag means "leave it as it is"; defaulting it to true would
    // silently reactivate a deactivated account on any unrelated edit.
    const isActive =
      typeof req.body?.isActive === "boolean"
        ? req.body.isActive
        : existing.rows[0].is_active;

    const newPin = req.body?.pin ? String(req.body.pin).trim() : "";
    if (newPin && !validPin(newPin)) {
      return badRequest(res, "PIN must be exactly 5 digits.");
    }
    if (newPin && await pinAlreadyUsed(newPin, id)) {
      return res.status(409).json({ message: "That PIN is already assigned to another account." });
    }

    const hash = newPin
      ? await bcrypt.hash(newPin, PIN_SALT_ROUNDS)
      : null;

    await db.query(
      `UPDATE users
          SET display_name = $1,
              role         = $2,
              can_reverse  = $3,
              is_active    = $4,
              phone        = $5,
              email        = $6,
              pin_hash     = COALESCE($7, pin_hash)
        WHERE id = $8`,
      [
        name,
        role,
        canReverse,
        isActive,
        phone,
        email,
        hash,
        id,
      ]
    );

    const staff = await db.query(`${STAFF_SQL} WHERE u.id = $1`, [id]);

    res.json({
      message: newPin
        ? `${name} updated and their PIN reset`
        : `${name} updated`,
      staff: staff.rows[0],
    });
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

/**
 * History belongs to the account that rang it, so a staff row that has ever
 * touched an order is switched off rather than removed.
 */
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown staff account.");
    if (id === req.user.id) {
      return badRequest(res, "You cannot remove the account you are signed in with.");
    }

    const references = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM orders WHERE created_by = $1) +
         (SELECT COUNT(*)::int FROM shifts WHERE employee_id = $1) +
         (SELECT COUNT(*)::int FROM order_reversals
           WHERE performed_by = $1 OR authorized_by = $1) AS n`,
      [id]
    );

    if (references.rows[0].n > 0) {
      await db.query("UPDATE users SET is_active = false WHERE id = $1", [id]);

      return res.json({
        message:
          "This account appears in order and shift history, so it was " +
          "deactivated instead of deleted. It can no longer sign in.",
        deactivated: true,
      });
    }

    const deleted = await db.query("DELETE FROM users WHERE id = $1", [id]);

    if (!deleted.rowCount) return notFound(res, "That account no longer exists.");

    res.json({ message: "Account deleted" });
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* POST /api/staff/change-pin — any signed-in account, for itself only */
/* ------------------------------------------------------------------ */

exports.changeOwnPin = async (req, res) => {
  try {
    const currentPin = String(req.body?.currentPin ?? "").trim();
    const newPin = String(req.body?.newPin ?? "").trim();

    if (!validPin(newPin)) {
      return badRequest(res, "New PIN must be exactly 5 digits.");
    }

    if (currentPin === newPin) {
      return badRequest(res, "The new PIN has to be different.");
    }

    const account = await db.query(
      "SELECT id, pin_hash, display_name FROM users WHERE id = $1",
      [req.user.id]
    );

    if (!account.rowCount) return notFound(res, "Account not found.");

    const matches = await bcrypt.compare(currentPin, account.rows[0].pin_hash);
    if (!matches) {
      return res.status(401).json({ message: "Your current PIN is not right." });
    }

    await db.query("UPDATE users SET pin_hash = $1 WHERE id = $2", [
      await bcrypt.hash(newPin, PIN_SALT_ROUNDS),
      req.user.id,
    ]);

    res.json({
      message: `PIN changed for ${account.rows[0].display_name ?? "this account"}`,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.updateOwnProfile = async (req, res) => {
  try {
    const name = text(req.body?.name, 120);
    const email = text(req.body?.email, 160) ?? "";
    const problems = [];

    if (!name) problems.push("Your name is required.");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      problems.push("Email address is not valid.");
    }

    if (problems.length) return badRequest(res, problems.join(" "));

    const result = await db.query(
      `UPDATE users
          SET display_name = $1, email = $2
        WHERE id = $3 AND is_active = true
        RETURNING id, display_name AS name, email, role`,
      [name, email || null, req.user.id]
    );

    if (!result.rowCount) return notFound(res, "Account not found.");

    res.json({ message: "Profile saved", user: result.rows[0] });
  } catch (error) {
    serverError(res, error);
  }
};
