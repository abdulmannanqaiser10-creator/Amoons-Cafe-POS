const db = require("../config/db");
const {
  badRequest,
  notFound,
  serverError,
  databaseProblem,
  round2,
  toNumber,
  text,
} = require("../helpers/http");

const REASONS = ["Opening", "Purchase", "Sale", "Return", "Waste", "Adjustment"];

const ITEM_SQL = `
  SELECT i.id           AS "itemId",
         i.product_id   AS "productId",
         p.name,
         p.unit,
         p.is_available AS "isAvailable",
         p.price,
         c.name         AS category,
         i.quantity::float        AS quantity,
         i.reorder_point::float   AS "reorderPoint",
         i.cost_price::float      AS "costPrice",
         i.updated_at   AS "updatedAt",
         CASE
           WHEN i.quantity <= 0 THEN 'Out'
           WHEN i.quantity <= i.reorder_point THEN 'Low'
           ELSE 'OK'
         END AS level
    FROM inventory_items i
    JOIN products p ON p.id = i.product_id
    JOIN categories c ON c.id = p.category_id
`;

exports.list = async (req, res) => {
  try {
    const params = [];
    // Turning tracking back off leaves the ledger row in place for history, so
    // the list has to follow the product's current flag rather than the row.
    const where = ["p.track_stock = true"];

    if (req.query.level === "low") where.push("i.quantity <= i.reorder_point AND i.quantity > 0");
    if (req.query.level === "out") where.push("i.quantity <= 0");
    if (req.query.q) {
      params.push(`%${String(req.query.q).trim().toLowerCase()}%`);
      where.push(`lower(p.name) LIKE $${params.length}`);
    }

    const result = await db.query(
      `${ITEM_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY p.name`,
      params
    );

    const summary = result.rows.reduce(
      (acc, row) => {
        acc.items += 1;
        acc.low += row.level === "Low" ? 1 : 0;
        acc.out += row.level === "Out" ? 1 : 0;
        acc.value += row.quantity * row.costPrice;
        return acc;
      },
      { items: 0, low: 0, out: 0, value: 0 }
    );

    res.json({
      items: result.rows.map((row) => ({ ...row, value: round2(row.quantity * row.costPrice) })),
      summary: { ...summary, value: round2(summary.value) },
      reasons: REASONS,
    });
  } catch (error) {
    serverError(res, error);
  }
};

/**
 * One ledger row and the new level are written together, and the database
 * refuses the pair if the quantity would drop below zero — so a stock level
 * can never drift away from the movements that explain it.
 */
exports.adjust = async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) return badRequest(res, "Unknown product.");

    const quantity = Number(req.body?.quantity);
    if (!Number.isFinite(quantity) || quantity === 0) {
      return badRequest(res, "Enter the amount the stock should move by.");
    }

    const reason = String(req.body?.reason ?? "Adjustment");
    if (!REASONS.includes(reason)) return badRequest(res, "Unknown stock reason.");

    const note = text(req.body?.note, 300);

    const product = await db.query(
      "SELECT id, name, unit, track_stock FROM products WHERE id = $1",
      [productId]
    );

    if (!product.rowCount) return notFound(res, "That product no longer exists.");

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      // Lock the product row first: two clerks adjusting the same item at the
      // same moment must serialise, not read-then-write over each other.
      await client.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [
        productId,
      ]);

      let item = await client.query(
        "SELECT id, quantity FROM inventory_items WHERE product_id = $1",
        [productId]
      );

      if (!item.rowCount) {
        await client.query(
          `INSERT INTO inventory_items (product_id, quantity, unit)
           VALUES ($1, 0, $2) ON CONFLICT (product_id) DO NOTHING`,
          [productId, product.rows[0].unit]
        );
        item = await client.query(
          "SELECT id, quantity FROM inventory_items WHERE product_id = $1",
          [productId]
        );

        if (!product.rows[0].track_stock) {
          await client.query(
            "UPDATE products SET track_stock = true, updated_at = now() WHERE id = $1",
            [productId]
          );
        }
      }

      const before = Number(item.rows[0].quantity);

      if (before + quantity < 0) {
        await client.query("ROLLBACK");
        return badRequest(
          res,
          `Only ${before} in stock — that would take the level below zero.`
        );
      }

      await client.query(
        `UPDATE inventory_items
            SET quantity = quantity + $1, updated_at = now()
          WHERE id = $2`,
        [quantity, item.rows[0].id]
      );

      await client.query(
        `INSERT INTO stock_movements (item_id, quantity, reason, note, performed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [item.rows[0].id, quantity, reason, note, req.user?.id ?? null]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const updated = await db.query(`${ITEM_SQL} WHERE i.product_id = $1`, [
      productId,
    ]);

    res.json({
      message: `${product.rows[0].name} stock ${quantity > 0 ? "increased" : "reduced"} by ${Math.abs(quantity)}`,
      item: updated.rows[0],
    });
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

exports.updateItem = async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) return badRequest(res, "Unknown product.");

    const reorderPoint = toNumber(req.body?.reorderPoint, -1);
    const costPrice = toNumber(req.body?.costPrice, -1);

    if (reorderPoint < 0 || costPrice < 0) {
      return badRequest(res, "Reorder point and cost price cannot be negative.");
    }

    const result = await db.query(
      `UPDATE inventory_items
          SET reorder_point = $1, cost_price = $2, updated_at = now()
        WHERE product_id = $3
        RETURNING id`,
      [reorderPoint, costPrice, productId]
    );

    if (!result.rowCount) {
      return notFound(res, "This product has no stock record yet.");
    }

    const item = await db.query(`${ITEM_SQL} WHERE i.product_id = $1`, [productId]);

    res.json({ message: "Stock settings saved", item: item.rows[0] });
  } catch (error) {
    serverError(res, error);
  }
};

exports.movements = async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) return badRequest(res, "Unknown product.");

    const result = await db.query(
      `SELECT m.id,
              m.quantity::float AS quantity,
              m.reason,
              m.note,
              m.reference,
              m.created_at      AS "createdAt",
              u.display_name    AS "performedByName"
         FROM stock_movements m
         JOIN inventory_items i ON i.id = m.item_id
         LEFT JOIN users u ON u.id = m.performed_by
        WHERE i.product_id = $1
        ORDER BY m.created_at DESC
        LIMIT 200`,
      [productId]
    );

    res.json({ movements: result.rows });
  } catch (error) {
    serverError(res, error);
  }
};
