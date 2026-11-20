const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { badRequest, serverError } = require("../helpers/http");
const {
  REWARD_TIERS,
  bestEligibleTier,
} = require("../services/rewardTiers");

const MEMBER_SQL = `
  SELECT m.id,
         m.name,
         m.phone,
         m.email,
         m.points,
         m.verified_at AS "verifiedAt",
         m.created_at AS "createdAt"
    FROM loyalty_members m
`;

function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    digits = `92${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith("3")) {
    digits = `92${digits}`;
  }
  return { raw, digits };
}

function validatePhone(value) {
  const { digits } = normalizePhone(value);
  if (!digits || digits.length < 10 || digits.length > 15) {
    return "Enter a valid mobile number (10–15 digits).";
  }
  return null;
}

function signCustomer(member) {
  return jwt.sign(
    {
      type: "customer",
      memberId: member.id,
      phone: member.phone,
      name: member.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function publicMember(member) {
  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    email: member.email || "",
    points: member.points || 0,
    verifiedAt: member.verifiedAt || null,
    createdAt: member.createdAt || null,
    eligibleRewards: bestEligibleTier(member.points || 0),
    rewardTiers: REWARD_TIERS,
  };
}

/**
 * Register or look up by mobile.
 * Existing phone → return account + points (no duplicate).
 * New phone → create with name + mobile.
 */
exports.register = async (req, res) => {
  const client = await db.connect();
  try {
    const phoneError = validatePhone(req.body?.phone);
    if (phoneError) return badRequest(res, phoneError);

    const name = String(req.body?.name ?? "").trim().slice(0, 120);
    if (!name) return badRequest(res, "Full name is required.");

    const { digits, raw } = normalizePhone(req.body.phone);

    await client.query("BEGIN");

    let member = await client.query(
      `${MEMBER_SQL}
        WHERE regexp_replace(m.phone, '\\D', '', 'g') = $1
           OR regexp_replace(m.phone, '\\D', '', 'g') = $2
        ORDER BY m.id
        FOR UPDATE`,
      [digits, digits.replace(/^92/, "0")]
    );

    // Also match local 03… forms stored without country code.
    if (!member.rowCount && digits.startsWith("92") && digits.length === 12) {
      const local = `0${digits.slice(2)}`;
      member = await client.query(
        `${MEMBER_SQL}
          WHERE regexp_replace(m.phone, '\\D', '', 'g') = $1
          ORDER BY m.id
          FOR UPDATE`,
        [local]
      );
    }

    let isNew = false;

    if (member.rowCount) {
      const updated = await client.query(
        `UPDATE loyalty_members
            SET name = COALESCE(NULLIF($1, ''), name),
                verified_at = COALESCE(verified_at, now()),
                updated_at = now()
          WHERE id = $2
          RETURNING id, name, phone, email, points,
                    verified_at AS "verifiedAt",
                    created_at AS "createdAt"`,
        [name, member.rows[0].id]
      );
      member = updated;
    } else {
      isNew = true;
      try {
        const created = await client.query(
          `INSERT INTO loyalty_members (name, phone, email, points, verified_at)
           VALUES ($1, $2, NULL, 0, now())
           RETURNING id, name, phone, email, points,
                     verified_at AS "verifiedAt",
                     created_at AS "createdAt"`,
          [name, raw || digits]
        );
        member = created;
      } catch (error) {
        if (error.code === "23505") {
          member = await client.query(
            `${MEMBER_SQL}
              WHERE regexp_replace(m.phone, '\\D', '', 'g') = $1
              ORDER BY m.id
              FOR UPDATE`,
            [digits]
          );
          isNew = false;
          if (member.rowCount) {
            const updated = await client.query(
              `UPDATE loyalty_members
                  SET name = COALESCE(NULLIF($1, ''), name),
                      verified_at = COALESCE(verified_at, now()),
                      updated_at = now()
                WHERE id = $2
                RETURNING id, name, phone, email, points,
                          verified_at AS "verifiedAt",
                          created_at AS "createdAt"`,
              [name, member.rows[0].id]
            );
            member = updated;
          }
        } else {
          throw error;
        }
      }
    }

    await client.query("COMMIT");

    const customer = publicMember(member.rows[0]);
    const token = signCustomer(customer);

    res.json({
      message: isNew ? "Rewards account created" : "Welcome back",
      token,
      customer,
      isNew,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    serverError(res, error);
  } finally {
    client.release();
  }
};

exports.me = async (req, res) => {
  try {
    const member = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [
      req.customer.memberId,
    ]);
    if (!member.rowCount) {
      return res.status(401).json({ message: "Customer account not found." });
    }
    res.json({ customer: publicMember(member.rows[0]) });
  } catch (error) {
    serverError(res, error);
  }
};

exports.rewards = async (req, res) => {
  try {
    const member = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [
      req.customer.memberId,
    ]);
    if (!member.rowCount) {
      return res.status(401).json({ message: "Customer account not found." });
    }

    const history = await db.query(
      `SELECT e.id, e.points, e.reason, e.note, e.created_at AS "createdAt",
              o.order_number AS "orderNumber"
         FROM loyalty_entries e
         LEFT JOIN orders o ON o.id = e.order_id
        WHERE e.member_id = $1
        ORDER BY e.created_at DESC
        LIMIT 50`,
      [req.customer.memberId]
    );

    res.json({
      customer: publicMember(member.rows[0]),
      rewardTiers: REWARD_TIERS,
      history: history.rows,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.REWARD_TIERS = REWARD_TIERS;
