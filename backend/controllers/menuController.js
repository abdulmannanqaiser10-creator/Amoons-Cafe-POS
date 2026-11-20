const db = require("../config/db");
const { serverError } = require("../helpers/http");
const { readSettings } = require("./settingsStore");

/**
 * The menu the till renders. Availability is derived here rather than stored,
 * so an inventory adjustment changes what the counter can sell immediately and
 * nothing has to remember to flip a flag.
 */
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
   ORDER BY c.sort_order, c.name, p.name
`;

exports.menu = async (req, res) => {
  try {
    const [products, categories, tax, business, receipt] = await Promise.all([
      db.query(MENU_SQL),
      db.query(
        `SELECT id, name, sort_order AS "sortOrder", is_active AS "isActive"
           FROM categories
          WHERE is_active = true
          ORDER BY sort_order, name`
      ),
      readSettings("tax"),
      readSettings("business"),
      readSettings("receipt"),
    ]);

    res.json({
      categories: categories.rows,
      products: products.rows.map((row) => ({
        ...row,
        price: Number(row.price),
      })),
      tax: tax.value,
      business: business.value,
      receipt: receipt.value,
    });
  } catch (error) {
    serverError(res, error);
  }
};
