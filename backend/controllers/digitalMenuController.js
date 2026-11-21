/**
 * Public Digital Menu (QR table ordering) — independent of POS/Admin UI.
 * Reuses catalogue, loyalty members/entries, and orders tables.
 */
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const {
  resolveWebsiteLines,
  recordMovements,
} = require("../services/catalogueLines");
const { applyTax } = require("./businessController");
const { readSettings } = require("./settingsStore");
const {
  REWARD_TIERS,
  REWARD_POINTS_PER_ORDER,
  findRewardTier,
  bestEligibleTier,
} = require("../services/rewardTiers");

const TABLES = [1, 2, 3, 4];
const recentClientKeys = new Map();

const MENU_SQL = `
  SELECT p.id,
         p.name,
         p.description,
         p.price,
         p.image_url           AS "imageUrl",
         p.is_available        AS "isAvailable",
         p.track_stock         AS "trackStock",
         p.unit,
         p.category_id         AS "categoryId",
         c.name                AS category,
         COALESCE(i.quantity, 0)::float AS stock,
         (p.is_available
            AND (p.track_stock = false OR COALESCE(i.quantity, 0) > 0)
         )                     AS "canSell"
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN inventory_items i ON i.product_id = p.id
   WHERE c.is_active = true
     AND p.is_available = true
   ORDER BY c.sort_order, c.name, p.name
`;

const MEMBER_SQL = `
  SELECT m.id, m.name, m.phone, m.email, m.points,
         m.verified_at AS "verifiedAt", m.created_at AS "createdAt"
    FROM loyalty_members m
`;

function badRequest(res, message) {
  return res.status(400).json({ message });
}

function serverError(res, error) {
  console.error("[digital-menu]", error);
  return res.status(500).json({ message: "Server error" });
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

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

function parseTable(value) {
  const n = Math.trunc(Number(value));
  return TABLES.includes(n) ? n : null;
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
    pointsPerOrder: REWARD_POINTS_PER_ORDER,
  };
}

function readCustomerToken(req) {
  const header = String(req.headers["x-customer-token"] || "").trim();
  if (!header || !process.env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(header, process.env.JWT_SECRET);
    if (payload?.type !== "customer" || !payload.memberId) return null;
    return payload;
  } catch {
    return null;
  }
}

function guardDuplicateClientKey(key) {
  if (!key) return false;
  const now = Date.now();
  const prev = recentClientKeys.get(key);
  if (prev && now - prev < 90_000) return true;
  recentClientKeys.set(key, now);
  for (const [k, t] of recentClientKeys) {
    if (now - t > 300_000) recentClientKeys.delete(k);
  }
  return false;
}

async function taxOf(subtotal, paymentMethod, client = db) {
  // Align dine-in digital menu with till: Cash 15%, Card 8%.
  if (paymentMethod === "Card") {
    return applyTax(subtotal, {
      enabled: true,
      rate: 8,
      inclusive: false,
      label: "Sales tax",
    });
  }
  if (paymentMethod === "Cash") {
    return applyTax(subtotal, {
      enabled: true,
      rate: 15,
      inclusive: false,
      label: "Sales tax",
    });
  }
  const { value } = await readSettings("tax", client);
  if (value?.enabled && Number(value.rate) > 0) {
    return applyTax(subtotal, value);
  }
  return applyTax(subtotal, {
    enabled: true,
    rate: 15,
    inclusive: false,
    label: "Sales tax",
  });
}

async function findMemberByPhone(client, digits, { forUpdate = false } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  let member = await client.query(
    `${MEMBER_SQL}
      WHERE regexp_replace(m.phone, '\\D', '', 'g') = $1
         OR regexp_replace(m.phone, '\\D', '', 'g') = $2
      ORDER BY m.id
      LIMIT 1${lock}`,
    [digits, digits.replace(/^92/, "0")]
  );
  if (!member.rowCount && digits.startsWith("92") && digits.length === 12) {
    member = await client.query(
      `${MEMBER_SQL}
        WHERE regexp_replace(m.phone, '\\D', '', 'g') = $1
        ORDER BY m.id
        LIMIT 1${lock}`,
      [`0${digits.slice(2)}`]
    );
  }
  return member;
}

async function upsertMember(client, { name, phone, forUpdate = false }) {
  const { raw, digits } = normalizePhone(phone);
  if (!digits) return null;
  let member = await findMemberByPhone(client, digits, { forUpdate });
  if (!member.rowCount) {
    try {
      member = await client.query(
        `INSERT INTO loyalty_members (name, phone, points)
         VALUES ($1, $2, 0)
         RETURNING id, name, phone, email, points,
                   verified_at AS "verifiedAt", created_at AS "createdAt"`,
        [name || `Customer ${digits}`, raw || digits]
      );
    } catch (error) {
      if (error.code === "23505") {
        member = await findMemberByPhone(client, digits, { forUpdate });
      } else {
        throw error;
      }
    }
  } else if (name) {
    await client.query(
      `UPDATE loyalty_members
          SET name = COALESCE(NULLIF($1, ''), name), updated_at = now()
        WHERE id = $2`,
      [name, member.rows[0].id]
    );
    member = await client.query(
      `${MEMBER_SQL} WHERE m.id = $1${forUpdate ? " FOR UPDATE" : ""}`,
      [member.rows[0].id]
    );
  }
  return member.rows[0] || null;
}

async function redeemPoints(client, memberId, orderId, tier) {
  const member = await client.query(
    `SELECT id, points FROM loyalty_members WHERE id = $1 FOR UPDATE`,
    [memberId]
  );
  if (!member.rowCount) return { error: "Rewards account not found." };
  if (member.rows[0].points < tier.points) {
    return {
      error: `Only ${member.rows[0].points} points available. Need ${tier.points}.`,
    };
  }
  const balance = member.rows[0].points - tier.points;
  await client.query(
    `UPDATE loyalty_members SET points = $1, updated_at = now() WHERE id = $2`,
    [balance, memberId]
  );
  await client.query(
    `INSERT INTO loyalty_entries (member_id, points, reason, note, order_id, performed_by)
     VALUES ($1, $2, 'Redeem', $3, $4, NULL)`,
    [
      memberId,
      -tier.points,
      `Digital menu · ${tier.label} (${tier.points} pts)`,
      orderId,
    ]
  );
  return { balance, redeemedPoints: tier.points };
}

exports.tables = async (_req, res) => {
  res.json({
    tables: TABLES.map((id) => ({
      id,
      name: `Table ${id}`,
      path: `/Digitalmenu-t${id}/`,
    })),
    rewardTiers: REWARD_TIERS,
    pointsPerOrder: REWARD_POINTS_PER_ORDER,
  });
};

exports.catalogue = async (req, res) => {
  try {
    const tableNumber = parseTable(req.query.table || req.params.table);
    const [products, categories, tax, business] = await Promise.all([
      db.query(MENU_SQL),
      db.query(
        `SELECT id, name, sort_order AS "sortOrder", is_active AS "isActive"
           FROM categories
          WHERE is_active = true
          ORDER BY sort_order, name`
      ),
      readSettings("tax"),
      readSettings("business"),
    ]);

    const mapped = products.rows.map((row) => ({
      ...row,
      price: Number(row.price),
    }));

    // Suggested items: up to 4 other available products (same category preferred at runtime on client).
    const suggestions = mapped.filter((p) => p.canSell).slice(0, 12);

    res.json({
      tableNumber,
      tableName: tableNumber ? `Table ${tableNumber}` : null,
      categories: categories.rows,
      products: mapped,
      suggestions,
      tax: tax.value,
      business: business.value,
      rewardTiers: REWARD_TIERS,
      pointsPerOrder: REWARD_POINTS_PER_ORDER,
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.register = async (req, res) => {
  const phoneError = validatePhone(req.body?.phone);
  if (phoneError) return badRequest(res, phoneError);
  const name = String(req.body?.name ?? "").trim().slice(0, 120);
  if (!name) return badRequest(res, "Full name is required.");
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: "Rewards sign-in is not configured." });
  }

  try {
    // Use the shared pool query path (no checked-out client) so register
    // cannot starve the single serverless connection slot.
    const member = await upsertMember(db, {
      name,
      phone: req.body.phone,
      forUpdate: false,
    });
    if (!member?.id) {
      return badRequest(res, "Could not create rewards account.");
    }

    const fresh = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [member.id]);
    const row = fresh.rows[0] || member;
    res.json({
      message: "Rewards account ready",
      token: signCustomer(row),
      customer: publicMember(row),
    });
  } catch (error) {
    serverError(res, error);
  }
};

exports.me = async (req, res) => {
  try {
    const payload = readCustomerToken(req);
    if (!payload) return res.status(401).json({ message: "Sign in with your phone number." });
    const result = await db.query(`${MEMBER_SQL} WHERE m.id = $1`, [
      payload.memberId,
    ]);
    if (!result.rowCount) {
      return res.status(404).json({ message: "Rewards account not found." });
    }
    res.json({ customer: publicMember(result.rows[0]) });
  } catch (error) {
    serverError(res, error);
  }
};

exports.createOrder = async (req, res) => {
  try {
    const body = req.body ?? {};
    const customerName = String(body.customerName ?? "").trim().slice(0, 120);
    if (!customerName) return badRequest(res, "Customer name is required.");

    const tableNumber = parseTable(body.tableNumber || body.table);
    if (!tableNumber) {
      return badRequest(res, "Choose a valid table (1–4).");
    }

    const phoneRaw = String(body.customerPhone ?? "").trim();
    let customerPhone = "";
    if (phoneRaw) {
      const phoneError = validatePhone(phoneRaw);
      if (phoneError) return badRequest(res, phoneError);
      customerPhone = normalizePhone(phoneRaw).raw;
    }

    const paymentMethod = String(body.paymentMethod ?? "Cash");
    if (!["Cash", "Card"].includes(paymentMethod)) {
      return badRequest(res, "Payment method must be Cash or Card.");
    }

    const clientKey = String(body.clientOrderKey || body.externalOrderId || "")
      .trim()
      .slice(0, 80);
    if (clientKey && guardDuplicateClientKey(clientKey)) {
      return badRequest(
        res,
        "This order was already submitted. Check Order Management or wait a moment."
      );
    }
    if (clientKey) {
      const prior = await db.query(
        `SELECT id FROM orders
          WHERE note ILIKE $1
            AND created_at > now() - interval '10 minutes'
          LIMIT 1`,
        [`%ClientKey: ${clientKey}%`]
      );
      if (prior.rowCount) {
        return badRequest(
          res,
          "This order was already submitted. Check Order Management or wait a moment."
        );
      }
    }

    const redeemPoints = Math.trunc(toNumber(body.redeemPoints));
    const tier = redeemPoints > 0 ? findRewardTier(redeemPoints) : null;
    if (redeemPoints > 0 && !tier) {
      return badRequest(res, "Choose a valid reward (10, 20, or 50 points).");
    }
    if (tier && !customerPhone) {
      return badRequest(res, "Phone number is required to redeem rewards.");
    }

    const customerJwt = readCustomerToken(req);
    if (tier && !customerJwt?.memberId) {
      return badRequest(
        res,
        "Register your phone number before redeeming rewards."
      );
    }

    const noteParts = [
      "Source: Digital Menu",
      `Table: ${tableNumber}`,
      tier ? `Redeemed: ${tier.points} pts → ${tier.label}` : null,
      body.notes ? `Notes: ${String(body.notes).trim()}` : null,
      clientKey ? `ClientKey: ${clientKey}` : null,
    ].filter(Boolean);

    const client = await db.connect();
    let totals = null;

    try {
      await client.query("BEGIN");

      const resolved = await resolveWebsiteLines(client, body.items);
      if (resolved.error) {
        await client.query("ROLLBACK");
        return badRequest(res, resolved.error);
      }

      const { items, subtotal, deductions } = resolved;
      let discountAmount = 0;
      let discountPercent = 0;
      let discountType = "none";
      if (tier) {
        discountPercent = tier.discountPercent;
        discountType = "percentage";
        discountAmount = round2((subtotal * discountPercent) / 100);
      }

      const afterDiscount = round2(Math.max(0, subtotal - discountAmount));
      const tax = await taxOf(afterDiscount, paymentMethod, client);
      const total = round2(tax.total);

      const amountPaid =
        paymentMethod === "Card"
          ? total
          : Math.min(
              Math.max(0, round2(toNumber(body.amountPaid) || total)),
              total
            );
      const paymentStatus =
        amountPaid <= 0 ? "Unpaid" : amountPaid >= total ? "Paid" : "Partial";

      const orderResult = await client.query(
        `INSERT INTO orders
           (order_number, customer_name, customer_phone, channel, status, payment_method,
            payment_status, amount_paid, subtotal, discount_amount, discount_type, discount_percent,
            discount_after_tax, tax_rate, tax_amount, total,
            note, delivery_address, created_by)
         VALUES (
           'DM-' || to_char(now(), 'YYMMDD') || '-' ||
             lpad(nextval('order_number_seq')::text, 5, '0'),
           $1, $2, 'Dine-In', 'Pending', $3, $4, $5, $6, $7, $8, $9, false,
           $10, $11, $12, $13, $14, NULL
         )
         RETURNING id, order_number AS "orderNumber"`,
        [
          customerName,
          customerPhone || null,
          paymentMethod,
          paymentStatus,
          amountPaid,
          subtotal,
          discountAmount,
          discountType,
          discountPercent,
          tax.rate,
          tax.taxAmount,
          total,
          noteParts.join(" · ").slice(0, 500) || null,
          `Table ${tableNumber}`,
        ]
      );

      const orderId = orderResult.rows[0].id;
      const orderNumber = orderResult.rows[0].orderNumber;

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

      if (deductions.length) {
        await recordMovements(client, deductions, {
          userId: null,
          orderId,
          reason: "Sale",
        });
      }

      let member = null;
      if (customerJwt?.memberId) {
        member = (
          await client.query(
            `SELECT id, points FROM loyalty_members WHERE id = $1 FOR UPDATE`,
            [customerJwt.memberId]
          )
        ).rows[0];
      } else if (customerPhone) {
        member = await upsertMember(client, {
          name: customerName,
          phone: customerPhone,
        });
      }

      if (tier) {
        if (!member?.id) {
          await client.query("ROLLBACK");
          return badRequest(res, "Rewards account required to redeem points.");
        }
        const redeemed = await redeemPoints(client, member.id, orderId, tier);
        if (redeemed.error) {
          await client.query("ROLLBACK");
          return badRequest(res, redeemed.error);
        }
      }

      const refreshed = member?.id
        ? await client.query(`SELECT id, points FROM loyalty_members WHERE id = $1`, [
            member.id,
          ])
        : { rows: [] };

      await client.query("COMMIT");
      totals = {
        orderId,
        orderNumber,
        tableNumber,
        channel: "Dine-In",
        subtotal,
        discountAmount,
        discountPercent,
        discountType,
        taxRate: tax.rate,
        taxAmount: tax.taxAmount,
        total,
        paymentMethod,
        paymentStatus,
        redeemedPoints: tier?.points || 0,
        loyaltyPointsAwarded: 0,
        loyaltyPointsPending: customerPhone || member?.id ? REWARD_POINTS_PER_ORDER : 0,
        loyaltyPointsBalance: refreshed.rows[0]?.points ?? null,
        loyaltyMemberId: member?.id ?? null,
        items: items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
        })),
      };
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw error;
    } finally {
      client.release();
    }

    try {
      await require("../services/emailNotifications").awaitNewSale(
        totals.orderId
      );
    } catch (emailError) {
      console.error(
        "[email] Digital menu sale notification failed:",
        emailError.message
      );
    }

    res.status(201).json({
      message: "Order received",
      order: totals,
    });
  } catch (error) {
    serverError(res, error);
  }
};
