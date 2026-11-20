const db = require("../config/db");
const {
  resolveWebsiteLines,
  recordMovements,
} = require("../services/catalogueLines");
const { applyTax } = require("./businessController");
const { readSettings } = require("./settingsStore");
const { findRewardTier } = require("../services/rewardTiers");

const PICKUP_ADDRESS =
  "AMOONS · Shop 3, Building 54C, DHA Phase 8 Zone A, Karachi, Pakistan";

function badRequest(res, message) {
  return res.status(400).json({ message });
}

function serverError(res, error) {
  console.error(error);
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
  return { raw, digits: raw.replace(/\D/g, "") };
}

function validateCustomerPhone(value) {
  const { digits } = normalizePhone(value);
  if (!digits || digits.length < 10 || digits.length > 15) {
    return "A valid phone number of 10–15 digits is required.";
  }
  return null;
}

async function taxOf(subtotal, client = db) {
  const { value } = await readSettings("tax", client);
  if (value?.enabled && Number(value.rate) > 0) {
    return applyTax(subtotal, value);
  }
  return applyTax(subtotal, {
    enabled: true,
    rate: 16,
    inclusive: false,
    label: "Sales tax",
  });
}

async function upsertWebsiteCustomer(client, { name, phone, email }) {
  const { raw, digits } = normalizePhone(phone);
  if (!digits) return null;

  let member = await client.query(
    `SELECT id, points FROM loyalty_members
      WHERE regexp_replace(phone, '\\D', '', 'g') = $1
      ORDER BY id
      FOR UPDATE`,
    [digits]
  );

  if (member.rowCount === 0) {
    try {
      const created = await client.query(
        `INSERT INTO loyalty_members (name, phone, email, points)
         VALUES ($1, $2, $3, 0)
         RETURNING id, points`,
        [name || `Customer ${digits}`, raw || digits, email || null]
      );
      member = created;
    } catch (error) {
      if (error.code === "23505") {
        member = await client.query(
          `SELECT id, points FROM loyalty_members
            WHERE regexp_replace(phone, '\\D', '', 'g') = $1
            ORDER BY id
            FOR UPDATE`,
          [digits]
        );
      } else {
        throw error;
      }
    }
  } else {
    await client.query(
      `UPDATE loyalty_members
          SET name = COALESCE(NULLIF($1, ''), name),
              email = COALESCE(NULLIF($2, ''), email),
              updated_at = now()
        WHERE id = $3`,
      [name || null, email || null, member.rows[0].id]
    );
    member = await client.query(
      `SELECT id, points FROM loyalty_members WHERE id = $1 FOR UPDATE`,
      [member.rows[0].id]
    );
  }

  return member.rows[0];
}

async function redeemWebsitePoints(client, memberId, orderId, tier) {
  const member = await client.query(
    `SELECT id, points FROM loyalty_members WHERE id = $1 FOR UPDATE`,
    [memberId]
  );
  if (!member.rowCount) {
    return { error: "Rewards account not found." };
  }
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
      `Website checkout · ${tier.label} (${tier.points} pts)`,
      orderId,
    ]
  );

  return { balance, redeemedPoints: tier.points };
}

/**
 * Public website checkout → Soft-POS Order Management.
 */
exports.create = async (req, res) => {
  try {
    const body = req.body ?? {};
    const customerName = String(body.customerName ?? "").trim().slice(0, 120);
    const phoneError = validateCustomerPhone(body.customerPhone);
    if (phoneError) return badRequest(res, phoneError);
    if (!customerName) return badRequest(res, "Customer name is required.");

    const customerPhone = normalizePhone(body.customerPhone).raw;
    const fulfillment =
      String(body.fulfillment || body.orderType || "Delivery").trim() ===
      "Pick-Up"
        ? "Pick-Up"
        : "Delivery";
    // Website orders always show as Web in Order Management.
    const channel = "Web";

    let deliveryAddress = String(body.deliveryAddress ?? "").trim();
    const city = String(body.city ?? "").trim();
    const area = String(body.area ?? "").trim();
    const deliveryFee = round2(Math.max(0, toNumber(body.deliveryFee)));

    if (fulfillment === "Pick-Up") {
      deliveryAddress = deliveryAddress || PICKUP_ADDRESS;
    } else {
      if (!deliveryAddress) {
        return badRequest(res, "A delivery address is required.");
      }
      if (!city || !area) {
        return badRequest(res, "Select a delivery city and area.");
      }
    }

    const paymentMethod = String(body.paymentMethod ?? "Cash");
    if (!["Cash", "Card"].includes(paymentMethod)) {
      return badRequest(res, "Payment method must be Cash or Card.");
    }

    const redeemPoints = Math.trunc(toNumber(body.redeemPoints));
    const tier = redeemPoints > 0 ? findRewardTier(redeemPoints) : null;
    if (redeemPoints > 0 && !tier) {
      return badRequest(
        res,
        "Choose a valid reward tier (10, 20, or 50 points)."
      );
    }
    if (tier && !req.customer?.memberId) {
      return badRequest(
        res,
        "Verify your mobile number before redeeming rewards."
      );
    }

    const email = String(body.email ?? "").trim().slice(0, 160);
    const noteParts = [
      "Source: Website",
      `Fulfillment: ${fulfillment}`,
      city ? `City: ${city}` : null,
      area ? `Area: ${area}` : null,
      deliveryFee > 0 ? `Delivery fee: Rs ${deliveryFee}` : null,
      tier ? `Redeemed: ${tier.points} pts → ${tier.label}` : null,
      body.notes ? `Notes: ${String(body.notes).trim()}` : null,
      email ? `Email: ${email}` : null,
      body.externalOrderId
        ? `WebRef: ${String(body.externalOrderId).trim()}`
        : null,
    ].filter(Boolean);
    const note = noteParts.join(" · ").slice(0, 500);

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
      const tax = await taxOf(afterDiscount, client);
      const total = round2(tax.total + (fulfillment === "Delivery" ? deliveryFee : 0));

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
           'WEB-' || to_char(now(), 'YYMMDD') || '-' ||
             lpad(nextval('order_number_seq')::text, 5, '0'),
           $1, $2, $3, 'Pending', $4, $5, $6, $7, $8, $9, $10, false,
           $11, $12, $13, $14, $15, NULL
         )
         RETURNING id, order_number AS "orderNumber"`,
        [
          customerName,
          customerPhone,
          channel,
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
          note || null,
          deliveryAddress,
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

      const member =
        req.customer?.memberId
          ? (
              await client.query(
                `SELECT id, points FROM loyalty_members WHERE id = $1 FOR UPDATE`,
                [req.customer.memberId]
              )
            ).rows[0]
          : await upsertWebsiteCustomer(client, {
              name: customerName,
              phone: customerPhone,
              email,
            });

      if (tier) {
        if (!member?.id) {
          await client.query("ROLLBACK");
          return badRequest(res, "Rewards account required to redeem points.");
        }
        const redeemed = await redeemWebsitePoints(
          client,
          member.id,
          orderId,
          tier
        );
        if (redeemed.error) {
          await client.query("ROLLBACK");
          return badRequest(res, redeemed.error);
        }
      }

      // Points are awarded only when the order is Completed + Paid in POS
      // (exactly 10 pts once). Do not earn on Pending website intake.
      const refreshed = member?.id
        ? await client.query(
            `SELECT id, points FROM loyalty_members WHERE id = $1`,
            [member.id]
          )
        : { rows: [] };

      await client.query("COMMIT");
      totals = {
        orderId,
        orderNumber,
        fulfillment,
        channel,
        subtotal,
        discountAmount,
        discountPercent,
        discountType,
        deliveryFee: fulfillment === "Delivery" ? deliveryFee : 0,
        taxRate: tax.rate,
        taxAmount: tax.taxAmount,
        total,
        paymentMethod,
        paymentStatus,
        redeemedPoints: tier?.points || 0,
        loyaltyPointsAwarded: 0,
        loyaltyPointsPending: 10,
        loyaltyPointsBalance: refreshed.rows[0]?.points ?? null,
        loyaltyMemberId: member?.id ?? null,
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
      await require("../services/emailNotifications").awaitNewSale(orderId);
    } catch (emailError) {
      console.error("[email] Failed to send website sale notification:", emailError.message);
    }

    res.status(201).json({
      message: "Website order received",
      order: totals,
    });
  } catch (error) {
    serverError(res, error);
  }
};
