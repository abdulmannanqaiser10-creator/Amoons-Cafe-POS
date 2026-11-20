/**
 * Stock and price resolution for order lines.
 *
 * The till used to send the prices it had rendered, which meant a browser
 * could edit a total before saving. Now that the menu lives in the database,
 * every line is re-priced here and every tracked item is checked and deducted
 * inside the same transaction as the order itself.
 */

const NOT_ENOUGH = (name, wanted, have) =>
  `Only ${have} of ${name} left in stock — ${wanted} were requested.`;

/**
 * Reads the catalogue rows a set of lines needs, locking the stock of any
 * tracked product so two tills cannot oversell the same last unit.
 */
async function loadCatalogue(client, productIds) {
  if (!productIds.length) return { products: new Map(), stock: new Map() };

  const products = await client.query(
    `SELECT p.id, p.name, p.price, p.is_available AS "isAvailable",
            p.track_stock AS "trackStock", p.unit,
            c.name AS category
       FROM products p
       JOIN categories c ON c.id = p.category_id
      WHERE p.id = ANY($1::int[])`,
    [productIds]
  );

  const tracked = products.rows
    .filter((row) => row.trackStock)
    .map((row) => row.id);

  const stock = tracked.length
    ? await client.query(
        `SELECT product_id, quantity::float AS quantity
           FROM inventory_items
          WHERE product_id = ANY($1::int[])
          FOR UPDATE`,
        [tracked]
      )
    : { rows: [] };

  return {
    // Coerce keys to Number — node-pg may return int/bigint ids as strings,
    // and Map lookup by number would silently miss those catalogue rows.
    products: new Map(
      products.rows.map((row) => [Number(row.id), { ...row, id: Number(row.id) }])
    ),
    stock: new Map(
      stock.rows.map((row) => [Number(row.product_id), Number(row.quantity)])
    ),
  };
}

/**
 * Turns the client's line list into priced, validated lines.
 * Returns { error } when a line cannot be honoured.
 */
async function resolveLines(client, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "An order needs at least one item" };
  }

  const ids = [
    ...new Set(
      rawItems
        .map((raw) => Math.trunc(Number(raw?.productId)))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];

  const { products, stock } = await loadCatalogue(client, ids);
  const items = [];
  const deductions = [];

  for (const raw of rawItems) {
    const quantity = Math.trunc(Number(raw?.quantity));

    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: "Every item needs a quantity of at least 1" };
    }

    const productId = Math.trunc(Number(raw?.productId));
    const product = products.get(productId);

    if (!product) {
      return {
        error:
          "Every line has to come from the menu. Refresh the till and try again.",
      };
    }

    if (!product.isAvailable) {
      return { error: `${product.name} is marked unavailable.` };
    }

    // The catalogue price wins. A stale tab cannot sell a drink at an old rate.
    const price = Math.round(Number(product.price) * 100) / 100;

    // Merge duplicate product lines from the till into one order line.
    const existingLine = items.find((line) => line.productId === productId);
    if (existingLine) {
      existingLine.quantity += quantity;
      existingLine.lineTotal =
        Math.round(existingLine.price * existingLine.quantity * 100) / 100;
    } else {
      items.push({
        productId,
        name: product.name,
        category: product.category,
        price,
        quantity,
        lineTotal: Math.round(price * quantity * 100) / 100,
      });
    }

    if (product.trackStock) {
      const have = stock.get(productId) ?? 0;
      const already = deductions.find((d) => d.productId === productId);
      const wanted = quantity + (already ? already.quantity : 0);

      if (wanted > have) return { error: NOT_ENOUGH(product.name, wanted, have) };

      if (already) already.quantity = wanted;
      else deductions.push({ productId, quantity, name: product.name });
    }
  }

  const subtotal =
    Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;

  return { items, subtotal, deductions };
}

/**
 * Writes one movement per product against the order. `quantity` is negative
 * for a sale and positive when a cancelled or reversed order gives stock back.
 */
async function recordMovements(client, deductions, { userId, orderId, reason }) {
  for (const line of deductions) {
    const item = await client.query(
      "SELECT id, quantity FROM inventory_items WHERE product_id = $1",
      [line.productId]
    );

    if (!item.rowCount) continue;

    const itemId = item.rows[0].id;
    const change = reason === "Sale" ? -line.quantity : line.quantity;

    const after = Number(item.rows[0].quantity) + change;
    if (after < 0) continue; // never let a refund push stock negative

    await client.query(
      `UPDATE inventory_items
          SET quantity = GREATEST(quantity + $1, 0), updated_at = now()
        WHERE id = $2`,
      [change, itemId]
    );

    await client.query(
      `INSERT INTO stock_movements
         (item_id, quantity, reason, note, reference, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        itemId,
        change,
        reason,
        line.name,
        orderId ? String(orderId) : null,
        userId ?? null,
      ]
    );
  }
}

/**
 * Re-reads an order's lines to give the stock back, used by cancel and
 * reverse. Only products that track stock are touched.
 */
async function deductionsOf(client, orderId) {
  const result = await client.query(
    `SELECT oi.product_id AS "productId",
            sum(oi.quantity)::int AS quantity,
            max(oi.product_name) AS name
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = $1 AND p.track_stock = true
      GROUP BY oi.product_id`,
    [orderId]
  );

  return result.rows;
}

/**
 * Resolves website cart lines by productId and/or product name against the
 * live catalogue so the public site can submit orders without till JWT auth.
 */
async function resolveWebsiteLines(client, rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "An order needs at least one item" };
  }

  const catalogue = await client.query(
    `SELECT p.id, p.name, p.price, p.is_available AS "isAvailable",
            p.track_stock AS "trackStock", p.unit,
            c.name AS category
       FROM products p
       JOIN categories c ON c.id = p.category_id`
  );

  const byId = new Map(catalogue.rows.map((row) => [row.id, row]));
  const byName = new Map(
    catalogue.rows.map((row) => [String(row.name).trim().toLowerCase(), row])
  );

  const trackedIds = catalogue.rows
    .filter((row) => row.trackStock)
    .map((row) => row.id);

  const stockResult = trackedIds.length
    ? await client.query(
        `SELECT product_id, quantity::float AS quantity
           FROM inventory_items
          WHERE product_id = ANY($1::int[])
          FOR UPDATE`,
        [trackedIds]
      )
    : { rows: [] };

  const stock = new Map(
    stockResult.rows.map((row) => [row.product_id, Number(row.quantity)])
  );

  const items = [];
  const deductions = [];
  const missing = [];

  for (const raw of rawItems) {
    const quantity = Math.trunc(Number(raw?.quantity));
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: "Every item needs a quantity of at least 1" };
    }

    const productId = Math.trunc(Number(raw?.productId));
    const nameKey = String(raw?.name ?? "")
      .trim()
      .toLowerCase();

    let product =
      (Number.isInteger(productId) && productId > 0 && byId.get(productId)) ||
      (nameKey ? byName.get(nameKey) : null);

    if (!product && nameKey) {
      product =
        catalogue.rows.find((row) =>
          String(row.name).trim().toLowerCase().includes(nameKey)
        ) ||
        catalogue.rows.find((row) =>
          nameKey.includes(String(row.name).trim().toLowerCase())
        ) ||
        null;
    }

    if (!product) {
      missing.push(raw?.name || `product #${productId || "?"}`);
      continue;
    }

    if (!product.isAvailable) {
      return { error: `${product.name} is marked unavailable.` };
    }

    const price = Math.round(Number(product.price) * 100) / 100;

    if (product.trackStock) {
      const have = stock.get(product.id) ?? 0;
      const already = deductions.find((d) => d.productId === product.id);
      const wanted = quantity + (already ? already.quantity : 0);
      if (wanted > have) {
        return { error: NOT_ENOUGH(product.name, wanted, have) };
      }
      if (already) already.quantity = wanted;
      else deductions.push({ productId: product.id, quantity, name: product.name });
    }

    items.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      price,
      quantity,
      lineTotal: Math.round(price * quantity * 100) / 100,
    });
  }

  if (missing.length) {
    return {
      error: `These items are not on the POS menu: ${missing.join(", ")}. Sync the website menu with Soft-POS products.`,
    };
  }

  if (!items.length) {
    return { error: "An order needs at least one item" };
  }

  const subtotal =
    Math.round(items.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;

  return { items, subtotal, deductions };
}

module.exports = {
  resolveLines,
  resolveWebsiteLines,
  recordMovements,
  deductionsOf,
};
