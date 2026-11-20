const db = require("../config/db");
const {
  badRequest,
  notFound,
  conflict,
  serverError,
  databaseProblem,
  round2,
  toNumber,
  text,
} = require("../helpers/http");

/* ------------------------------------------------------------------ */
/* Shared reads                                                        */
/* ------------------------------------------------------------------ */

// A base without ORDER BY so the single-row reads can append a WHERE clause.
const CATEGORY_SQL = `
  SELECT c.id,
         c.name,
         c.sort_order   AS "sortOrder",
         c.is_active    AS "isActive",
         c.updated_at   AS "updatedAt",
         (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS "productCount"
    FROM categories c
`;

const PRODUCT_SQL = `
  SELECT p.id,
         p.name,
         p.description,
         p.price,
         p.image_url      AS "imageUrl",
         p.is_available   AS "isAvailable",
         p.track_stock    AS "trackStock",
         p.unit,
         p.category_id    AS "categoryId",
         c.name           AS category,
         p.updated_at     AS "updatedAt",
         COALESCE(i.quantity, 0)::float AS stock,
         (p.is_available
            AND (p.track_stock = false OR COALESCE(i.quantity, 0) > 0)
         ) AS "canSell",
         (SELECT COUNT(*)::int FROM order_items oi WHERE oi.product_id = p.id) AS "orderCount"
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN inventory_items i ON i.product_id = p.id
`;

async function categoryExists(id) {
  const result = await db.query("SELECT 1 FROM categories WHERE id = $1", [id]);
  return result.rowCount > 0;
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

exports.listCategories = async (req, res) => {
  try {
    const result = await db.query(
      `${CATEGORY_SQL} ORDER BY c.sort_order, c.name`
    );
    res.json({ categories: result.rows });
  } catch (error) {
    serverError(res, error);
  }
};

exports.createCategory = async (req, res) => {
  try {
    const name = text(req.body?.name, 80);

    if (!name) return badRequest(res, "Category name is required.");

    const sortOrder = Math.trunc(toNumber(req.body?.sortOrder, 0));

    const result = await db.query(
      `INSERT INTO categories (name, sort_order)
       VALUES ($1, $2)
       RETURNING id`,
      [name, sortOrder]
    );

    const created = await db.query(`${CATEGORY_SQL} WHERE c.id = $1`, [
      result.rows[0].id,
    ]);

    res.status(201).json({
      message: `Category “${name}” created`,
      category: created.rows[0],
    });
  } catch (error) {
    const problem = databaseProblem(error, {
      unique: { name: "A category with that name already exists." },
    });
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown category.");

    if (!(await categoryExists(id))) {
      return notFound(res, "That category no longer exists.");
    }

    const name = text(req.body?.name, 80);
    if (!name) return badRequest(res, "Category name is required.");

    const sortOrder = Math.trunc(toNumber(req.body?.sortOrder, 0));
    const isActive =
      typeof req.body?.isActive === "boolean" ? req.body.isActive : true;

    await db.query(
      `UPDATE categories
          SET name = $1, sort_order = $2, is_active = $3, updated_at = now()
        WHERE id = $4`,
      [name, sortOrder, isActive, id]
    );

    const updated = await db.query(`${CATEGORY_SQL} WHERE c.id = $1`, [id]);

    res.json({
      message: `Category renamed to “${name}”`,
      category: updated.rows[0],
    });
  } catch (error) {
    const problem = databaseProblem(error, {
      unique: { name: "A category with that name already exists." },
    });
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

/**
 * A category with products is never silently emptied: the caller must say
 * where those products go, which is what `reassignTo` is for. Without it the
 * database would refuse anyway, and the operator would get a raw error.
 */
exports.deleteCategory = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown category.");

    if (!(await categoryExists(id))) {
      return notFound(res, "That category no longer exists.");
    }

    const inUse = await db.query(
      "SELECT COUNT(*)::int AS n FROM products WHERE category_id = $1",
      [id]
    );

    if (inUse.rows[0].n > 0) {
      const target = Number(req.query.reassignTo);

      if (!Number.isInteger(target) || target === id) {
        return conflict(
          res,
          `${inUse.rows[0].n} product(s) still sit in this category. ` +
            "Move them to another category first."
        );
      }

      if (!(await categoryExists(target))) {
        return badRequest(res, "The category to move them to does not exist.");
      }

      const client = await db.connect();

      try {
        await client.query("BEGIN");
        await client.query(
          "UPDATE products SET category_id = $1, updated_at = now() WHERE category_id = $2",
          [target, id]
        );
        await client.query("DELETE FROM categories WHERE id = $1", [id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      return res.json({
        message: `Category deleted and ${inUse.rows[0].n} product(s) moved`,
      });
    }

    await db.query("DELETE FROM categories WHERE id = $1", [id]);

    res.json({ message: "Category deleted" });
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

exports.listProducts = async (req, res) => {
  try {
    const params = [];
    const where = [];

    if (req.query.categoryId) {
      params.push(Number(req.query.categoryId));
      where.push(`p.category_id = $${params.length}`);
    }

    if (req.query.q) {
      params.push(`%${String(req.query.q).trim().toLowerCase()}%`);
      where.push(`lower(p.name) LIKE $${params.length}`);
    }

    if (req.query.availability === "available") where.push("p.is_available = true");
    if (req.query.availability === "unavailable") where.push("p.is_available = false");
    if (req.query.availability === "low") {
      where.push("p.track_stock = true AND COALESCE(i.quantity,0) <= i.reorder_point");
    }

    const result = await db.query(
      `${PRODUCT_SQL} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY c.sort_order, p.name`,
      params
    );

    res.json({
      products: result.rows.map((row) => ({
        ...row,
        price: Number(row.price),
      })),
    });
  } catch (error) {
    serverError(res, error);
  }
};

/** Validates the create/update body once, for both routes. */
async function readProductBody(body) {
  const name = text(body?.name, 160);
  if (!name) return { problems: ["Product name is required."] };

  const categoryId = Number(body?.categoryId);
  if (!Number.isInteger(categoryId)) {
    return { problems: ["Choose the category this product belongs to."] };
  }
  if (!(await categoryExists(categoryId))) {
    return { problems: ["That category no longer exists."] };
  }

  const price = round2(toNumber(body?.price, -1));
  if (price < 0) return { problems: ["Price must be zero or more."] };

  const trackStock = body?.trackStock === true;
  const unit = text(body?.unit, 40) ?? "pcs";
  const description = text(body?.description, 500);
  const imageUrl = String(body?.imageUrl ?? "").trim();
  const isAvailable =
    typeof body?.isAvailable === "boolean" ? body.isAvailable : true;

  const problems = [];
  const uploadedImage = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(imageUrl);
  if (imageUrl.startsWith("data:") && !uploadedImage) {
    problems.push("Uploaded image data is not a valid PNG, JPEG, WebP, or GIF.");
  } else if (uploadedImage) {
    const encoded = uploadedImage[1];
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length > 2 * 1024 * 1024 || bytes.length === 0) {
      problems.push("Uploaded images must be smaller than 2 MB.");
    }
  } else if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    problems.push("Image must be a full http(s) URL or an uploaded PNG, JPEG, WebP, or GIF.");
  } else if (imageUrl.length > 2048) {
    problems.push("Image URLs must be no longer than 2,048 characters.");
  }

  if (problems.length) return { problems };

  return {
    values: {
      name,
      categoryId,
      price,
      description,
      imageUrl,
      isAvailable,
      trackStock,
      unit,
    },
  };
}

exports.createProduct = async (req, res) => {
  try {
    const { problems, values } = await readProductBody(req.body ?? {});
    if (problems) return badRequest(res, problems.join(" "));

    const client = await db.connect();

    let created;

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO products
           (category_id, name, description, price, image_url,
            is_available, track_stock, unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          values.categoryId,
          values.name,
          values.description,
          values.price,
          values.imageUrl,
          values.isAvailable,
          values.trackStock,
          values.unit,
        ]
      );

      created = result.rows[0].id;

      // Turning stock on without a ledger row would read as "out of stock"
      // the moment the till refreshed, so open one at zero.
      if (values.trackStock) {
        await client.query(
          `INSERT INTO inventory_items (product_id, unit)
           VALUES ($1, $2) ON CONFLICT (product_id) DO NOTHING`,
          [created, values.unit]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const product = await db.query(`${PRODUCT_SQL} WHERE p.id = $1`, [created]);

    res.status(201).json({
      message: `${values.name} added to the menu`,
      product: { ...product.rows[0], price: Number(product.rows[0].price) },
      ...(values.trackStock
        ? { hint: "Stock is tracked for this item and starts at zero — record a purchase before it can be sold." }
        : {}),
    });
  } catch (error) {
    const problem = databaseProblem(error, {
      unique: { name: "A product with that name already exists." },
    });
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown product.");

    const existing = await db.query(
      "SELECT id, track_stock FROM products WHERE id = $1",
      [id]
    );

    if (!existing.rowCount) return notFound(res, "That product no longer exists.");

    const { problems, values } = await readProductBody(req.body ?? {});
    if (problems) return badRequest(res, problems.join(" "));

    const wasTracked = existing.rows[0].track_stock;

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE products
            SET category_id  = $1,
                name         = $2,
                description  = $3,
                price        = $4,
                image_url    = $5,
                is_available = $6,
                track_stock  = $7,
                unit         = $8,
                updated_at   = now()
          WHERE id = $9`,
        [
          values.categoryId,
          values.name,
          values.description,
          values.price,
          values.imageUrl,
          values.isAvailable,
          values.trackStock,
          values.unit,
          id,
        ]
      );

      if (values.trackStock && !wasTracked) {
        await client.query(
          `INSERT INTO inventory_items (product_id, unit)
           VALUES ($1, $2) ON CONFLICT (product_id) DO NOTHING`,
          [id, values.unit]
        );
      }

      await client.query(
        "UPDATE inventory_items SET unit = $1 WHERE product_id = $2",
        [values.unit, id]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const product = await db.query(`${PRODUCT_SQL} WHERE p.id = $1`, [id]);

    res.json({
      message: `${values.name} updated`,
      product: { ...product.rows[0], price: Number(product.rows[0].price) },
    });
  } catch (error) {
    const problem = databaseProblem(error, {
      unique: { name: "A product with that name already exists." },
    });
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};

/**
 * A product that has been sold is retired rather than deleted — order history
 * and every printed bill have to keep pointing at something real.
 */
exports.deleteProduct = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, "Unknown product.");

    const used = await db.query(
      "SELECT COUNT(*)::int AS n FROM order_items WHERE product_id = $1",
      [id]
    );

    if (used.rows[0].n > 0) {
      await db.query(
        "UPDATE products SET is_available = false, updated_at = now() WHERE id = $1",
        [id]
      );

      return res.json({
        message:
          `This product appears on ${used.rows[0].n} order line(s), so it was ` +
          "marked unavailable instead of deleted.",
        retired: true,
      });
    }

    const deleted = await db.query("DELETE FROM products WHERE id = $1", [id]);

    if (!deleted.rowCount) return notFound(res, "That product no longer exists.");

    res.json({ message: "Product deleted" });
  } catch (error) {
    const problem = databaseProblem(error);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    serverError(res, error);
  }
};
