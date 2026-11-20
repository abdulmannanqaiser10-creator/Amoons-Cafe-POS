const db = require("./db");

/**
 * Idempotent POS schema bootstrap.
 *
 * Runs as ordered steps (not one giant query) so a non-critical seed conflict
 * cannot roll back core tables, and so serverless cold starts can retry
 * transient Neon wake / connection failures without sticking forever.
 */

const REQUIRED_TABLES = [
  "users",
  "orders",
  "order_items",
  "order_reversals",
  "branches",
  "shifts",
  "cash_pulls",
  "app_settings",
  "categories",
  "products",
  "inventory_items",
  "stock_movements",
  "loyalty_members",
  "loyalty_entries",
];

const STEPS = [
  {
    name: "users",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id         SERIAL PRIMARY KEY,
        pin_hash   TEXT NOT NULL,
        role       VARCHAR(20) NOT NULL DEFAULT 'staff',
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(120);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS can_reverse BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(160);
      ALTER TABLE users ALTER COLUMN role SET DEFAULT 'staff';

      UPDATE users SET role = 'staff' WHERE role = 'user';

      UPDATE users
         SET display_name = CASE role WHEN 'admin' THEN 'Manager' ELSE 'Cashier' END
                            || ' ' || id::text
       WHERE display_name IS NULL;

      UPDATE users SET can_reverse = true WHERE role = 'admin' AND can_reverse = false;
      UPDATE users SET can_reverse = true
       WHERE lower(trim(display_name)) = 'maaz' AND role = 'staff';
    `,
  },
  {
    name: "orders",
    sql: `
      CREATE SEQUENCE IF NOT EXISTS order_number_seq;

      CREATE TABLE IF NOT EXISTS orders (
        id               SERIAL PRIMARY KEY,
        order_number     VARCHAR(32)  NOT NULL UNIQUE,
        customer_name    VARCHAR(120),
        customer_phone   VARCHAR(40),
        channel          VARCHAR(20)  NOT NULL DEFAULT 'Dine-In',
        status           VARCHAR(20)  NOT NULL DEFAULT 'Pending',
        payment_method   VARCHAR(20)  NOT NULL DEFAULT 'Cash',
        payment_status   VARCHAR(20)  NOT NULL DEFAULT 'Unpaid',
        amount_paid      NUMERIC(14,2) NOT NULL DEFAULT 0,
        subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
        total            NUMERIC(14,2) NOT NULL DEFAULT 0,
        note             TEXT,
        rider_name       VARCHAR(120),
        rider_phone      VARCHAR(40),
        delivery_address TEXT,
        created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT orders_channel_check
          CHECK (channel IN ('Dine-In','Takeaway','Delivery','Foodpanda','Web')),
        CONSTRAINT orders_status_check
          CHECK (status IN ('Pending','Preparing','Ready','Completed','Cancelled','Reversed')),
        CONSTRAINT orders_payment_method_check
          CHECK (payment_method IN ('Cash','Card','Online','Foodpanda')),
        CONSTRAINT orders_payment_status_check
          CHECK (payment_status IN ('Paid','Unpaid','Partial')),
        CONSTRAINT orders_amount_paid_check CHECK (amount_paid >= 0),
        CONSTRAINT orders_total_check CHECK (total >= 0)
      );

      ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(40);
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_channel_check;
      ALTER TABLE orders ADD CONSTRAINT orders_channel_check
        CHECK (channel IN ('Dine-In','Takeaway','Delivery','Foodpanda','Web'));
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
      ALTER TABLE orders ADD CONSTRAINT orders_status_check
        CHECK (status IN ('Pending','Preparing','Ready','Completed','Cancelled','Reversed'));
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_rate   NUMERIC(6,3) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(16) NOT NULL DEFAULT 'none';
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_after_tax BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(6,3) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_invoice_id VARCHAR(64);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_status VARCHAR(24);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_qr_link TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_res_code VARCHAR(16);
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_error TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_payload JSONB;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_response JSONB;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS srb_submitted_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS order_items (
        id           SERIAL PRIMARY KEY,
        order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id   INTEGER NOT NULL,
        product_name VARCHAR(160) NOT NULL,
        category     VARCHAR(80),
        unit_price   NUMERIC(14,2) NOT NULL,
        quantity     INTEGER NOT NULL DEFAULT 1,
        line_total   NUMERIC(14,2) NOT NULL,

        CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
        CONSTRAINT order_items_price_check CHECK (unit_price >= 0)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
      CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders (channel);
      CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders (payment_status);
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
    `,
  },
  {
    name: "reversals",
    sql: `
      CREATE TABLE IF NOT EXISTS order_reversals (
        id              SERIAL PRIMARY KEY,
        order_id        INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
        amount          NUMERIC(14,2) NOT NULL,
        amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
        payment_method  VARCHAR(20) NOT NULL,
        payment_status  VARCHAR(20) NOT NULL,
        status_before   VARCHAR(20) NOT NULL,
        reason          TEXT NOT NULL,
        performed_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        authorized_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT order_reversals_amount_check CHECK (amount >= 0),
        CONSTRAINT order_reversals_paid_check CHECK (amount_paid >= 0)
      );

      ALTER TABLE order_reversals ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_reversals_created_at ON order_reversals (created_at DESC);
    `,
  },
  {
    name: "shifts",
    sql: `
      CREATE TABLE IF NOT EXISTS branches (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(120) NOT NULL UNIQUE,
        address    TEXT,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      INSERT INTO branches (name, address)
      VALUES ('Main Branch', 'Head office')
      ON CONFLICT (name) DO NOTHING;

      CREATE SEQUENCE IF NOT EXISTS shift_number_seq;

      CREATE TABLE IF NOT EXISTS shifts (
        id            SERIAL PRIMARY KEY,
        shift_number  VARCHAR(32) NOT NULL UNIQUE,
        branch_id     INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        employee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status        VARCHAR(10) NOT NULL DEFAULT 'Open',
        opening_cash  NUMERIC(14,2) NOT NULL DEFAULT 0,
        closing_cash  NUMERIC(14,2),
        expected_cash NUMERIC(14,2),
        difference    NUMERIC(14,2),
        notes         TEXT,
        opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        closed_at     TIMESTAMPTZ,

        CONSTRAINT shifts_status_check CHECK (status IN ('Open','Closed')),
        CONSTRAINT shifts_opening_cash_check CHECK (opening_cash >= 0),
        CONSTRAINT shifts_closed_needs_end
          CHECK (status <> 'Closed' OR closed_at IS NOT NULL)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_shift_per_employee
        ON shifts (employee_id) WHERE status = 'Open';

      CREATE INDEX IF NOT EXISTS idx_shifts_opened_at ON shifts (opened_at DESC);
      CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts (branch_id);

      ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_report JSONB;

      CREATE TABLE IF NOT EXISTS cash_pulls (
        id         SERIAL PRIMARY KEY,
        shift_id   INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        amount     NUMERIC(14,2) NOT NULL,
        reason     VARCHAR(160) NOT NULL,
        notes      TEXT,
        pulled_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT cash_pulls_amount_check CHECK (amount > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_cash_pulls_shift ON cash_pulls (shift_id);
    `,
  },
  {
    name: "settings",
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key        VARCHAR(60) PRIMARY KEY,
        value      JSONB NOT NULL,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      UPDATE app_settings
         SET value = jsonb_set(value, '{name}', '"Amoons"', true),
             updated_at = now()
       WHERE key = 'business'
         AND COALESCE(value->>'name', '') IN ('LexOS', 'Lexos', 'lexos', 'Soft POS', 'Amoons Soft POS');
    `,
  },
  {
    name: "catalogue",
    sql: `
      CREATE TABLE IF NOT EXISTS categories (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(80) NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active  BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS products (
        id           SERIAL PRIMARY KEY,
        category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        name         VARCHAR(160) NOT NULL,
        description  TEXT,
        price        NUMERIC(14,2) NOT NULL DEFAULT 0,
        image_url    TEXT,
        is_available BOOLEAN NOT NULL DEFAULT true,
        track_stock  BOOLEAN NOT NULL DEFAULT false,
        unit         VARCHAR(40) NOT NULL DEFAULT 'pcs',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT products_price_check CHECK (price >= 0)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uniq_products_name ON products (lower(name));
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_categories_name ON categories (lower(name));
      CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
    `,
  },
  {
    name: "inventory",
    sql: `
      CREATE TABLE IF NOT EXISTS inventory_items (
        id            SERIAL PRIMARY KEY,
        product_id    INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
        quantity      NUMERIC(14,3) NOT NULL DEFAULT 0,
        unit          VARCHAR(40) NOT NULL DEFAULT 'pcs',
        cost_price    NUMERIC(14,2) NOT NULL DEFAULT 0,
        reorder_point NUMERIC(14,3) NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT inventory_quantity_check  CHECK (quantity >= 0),
        CONSTRAINT inventory_cost_check      CHECK (cost_price >= 0),
        CONSTRAINT inventory_reorder_check   CHECK (reorder_point >= 0)
      );

      CREATE TABLE IF NOT EXISTS stock_movements (
        id           SERIAL PRIMARY KEY,
        item_id      INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        quantity     NUMERIC(14,3) NOT NULL,
        reason       VARCHAR(20) NOT NULL,
        note         TEXT,
        reference    VARCHAR(60),
        performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT stock_movements_reason_check
          CHECK (reason IN ('Opening','Purchase','Sale','Return','Waste','Adjustment')),
        CONSTRAINT stock_movements_nonzero_check CHECK (quantity <> 0)
      );

      CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements (item_id);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_created
        ON stock_movements (created_at DESC);
    `,
  },
  {
    name: "loyalty",
    sql: `
      CREATE TABLE IF NOT EXISTS loyalty_members (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(120) NOT NULL,
        phone      VARCHAR(40) NOT NULL UNIQUE,
        email      VARCHAR(160),
        points     INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT loyalty_points_check CHECK (points >= 0)
      );

      CREATE TABLE IF NOT EXISTS loyalty_entries (
        id           SERIAL PRIMARY KEY,
        member_id    INTEGER NOT NULL REFERENCES loyalty_members(id) ON DELETE CASCADE,
        points       INTEGER NOT NULL,
        reason       VARCHAR(20) NOT NULL,
        note         TEXT,
        order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT loyalty_entries_reason_check CHECK (reason IN ('Earn','Redeem','Adjustment')),
        CONSTRAINT loyalty_entries_nonzero_check CHECK (points <> 0)
      );

      ALTER TABLE loyalty_entries DROP CONSTRAINT IF EXISTS loyalty_entries_order_id_key;
      DROP INDEX IF EXISTS loyalty_entries_order_id_key;
      -- One Earn entry per order; Redeem/Adjustment may also reference the same order.
      CREATE UNIQUE INDEX IF NOT EXISTS loyalty_entries_earn_order_id_key
        ON loyalty_entries (order_id)
        WHERE reason = 'Earn' AND order_id IS NOT NULL;

      DO $$
      BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_loyalty_phone_digits
          ON loyalty_members (regexp_replace(phone, '\\D', '', 'g'));
      EXCEPTION
        WHEN unique_violation THEN
          RAISE NOTICE 'Skipped uniq_loyalty_phone_digits — resolve duplicate phone digits first';
        WHEN duplicate_table THEN
          NULL;
        WHEN duplicate_object THEN
          NULL;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_loyalty_entries_member
        ON loyalty_entries (member_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS customer_otps (
        id           SERIAL PRIMARY KEY,
        phone_digits VARCHAR(20) NOT NULL,
        code_hash    TEXT NOT NULL,
        name         VARCHAR(120),
        attempts     INTEGER NOT NULL DEFAULT 0,
        expires_at   TIMESTAMPTZ NOT NULL,
        consumed_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_customer_otps_phone
        ON customer_otps (phone_digits, created_at DESC);

      ALTER TABLE loyalty_members
        ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    `,
  },
  {
    name: "seed-catalogue",
    optional: true,
    sql: `
      INSERT INTO categories (id, name, sort_order)
      SELECT v.id, v.name, v.sort_order
        FROM (VALUES
          (1, 'Ice Tea', 10),
          (2, 'Hot Coffees', 20),
          (3, 'Mojitos', 30),
          (4, 'Chillers', 40),
          (5, 'Frappe', 50),
          (6, 'Ice Coffees', 60)
        ) AS v(id, name, sort_order)
       WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.id = v.id)
         AND NOT EXISTS (SELECT 1 FROM categories c WHERE lower(c.name) = lower(v.name));

      INSERT INTO products (id, category_id, name, price)
      SELECT v.id, v.category_id, v.name, v.price
        FROM (VALUES
          (1, 1, 'Passion Ice Tea', 450),
          (2, 1, 'Peach Ice Tea', 540),
          (3, 2, 'Hot Coffee', 490),
          (4, 2, 'Hot Cappuccino', 580),
          (5, 2, 'Hot Latte', 650),
          (6, 3, 'Mint Mojito', 350),
          (7, 3, 'Blue Mojito', 540),
          (8, 5, 'Chocolate Frappe', 670),
          (9, 6, 'Cold Coffee', 550)
        ) AS v(id, category_id, name, price)
       WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = v.id)
         AND NOT EXISTS (SELECT 1 FROM products p WHERE lower(p.name) = lower(v.name))
         AND EXISTS (SELECT 1 FROM categories c WHERE c.id = v.category_id);

      SELECT setval(
        pg_get_serial_sequence('categories', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 1) FROM categories), 1)
      );
      SELECT setval(
        pg_get_serial_sequence('products', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 1) FROM products), 1)
      );
    `,
  },
  {
    name: "order-items-product-fk",
    optional: true,
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_fk')
           AND NOT EXISTS (
             SELECT 1 FROM order_items oi
              WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = oi.product_id)
           )
        THEN
          ALTER TABLE order_items
            ADD CONSTRAINT order_items_product_fk
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
        END IF;
      END $$;
    `,
  },
];

const TRANSIENT_CODES = new Set([
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000",
  "08003",
  "08006",
  "08001",
  "08004",
  "40001", // serialization_failure
  "40P01", // deadlock
  "53300", // too_many_connections
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(error) {
  if (!error) return false;
  if (TRANSIENT_CODES.has(error.code)) return true;
  const message = String(error.message || "").toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("terminat") ||
    message.includes("connection") ||
    message.includes("too many clients") ||
    message.includes("neon") ||
    message.includes("remaining connection slots")
  );
}

async function listMissingTables(client = db) {
  const result = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name = ANY($1::text[])`,
    [REQUIRED_TABLES]
  );
  const present = new Set(result.rows.map((row) => row.table_name));
  return REQUIRED_TABLES.filter((name) => !present.has(name));
}

async function verifySchema(client = db) {
  const missing = await listMissingTables(client);
  if (missing.length) {
    const error = new Error(`Missing tables: ${missing.join(", ")}`);
    error.code = "SCHEMA_INCOMPLETE";
    throw error;
  }

  // Spot-check columns that were added after the original tables shipped.
  await client.query(`
    SELECT o.discount_amount, o.tax_amount, u.display_name, u.is_active, p.track_stock
      FROM orders o
      CROSS JOIN users u
      CROSS JOIN products p
     LIMIT 0
  `);

  return true;
}

async function runSteps(client) {
  for (const step of STEPS) {
    try {
      await client.query(step.sql);
    } catch (error) {
      if (step.optional) {
        console.warn(`Schema step "${step.name}" skipped:`, error.message);
        continue;
      }
      error.message = `Schema step "${step.name}" failed: ${error.message}`;
      throw error;
    }
  }
}

async function migrateOnce() {
  const client = await db.connect();
  try {
    await client.query("SELECT 1");
    await runSteps(client);
    await verifySchema(client);
    return true;
  } finally {
    client.release();
  }
}

let pending = null;
let ready = false;

async function ensureSchema({ attempts = 5 } = {}) {
  if (ready) {
    try {
      await verifySchema();
      return true;
    } catch {
      ready = false;
    }
  }

  if (pending) return pending;

  pending = (async () => {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await migrateOnce();
        ready = true;
        return true;
      } catch (error) {
        lastError = error;
        ready = false;
        console.error(
          `ensureSchema attempt ${attempt}/${attempts} failed:`,
          error.message
        );

        if (!isTransient(error) && error.code !== "SCHEMA_INCOMPLETE" && attempt >= 2) {
          // Non-transient SQL errors still get one retry in case the DB was
          // mid-wake, then surface.
        }

        if (attempt < attempts && (isTransient(error) || error.code === "SCHEMA_INCOMPLETE")) {
          await sleep(Math.min(8000, 700 * attempt * attempt));
          continue;
        }

        if (attempt < attempts && isTransient(error)) {
          await sleep(Math.min(8000, 700 * attempt * attempt));
          continue;
        }

        if (attempt < attempts) {
          await sleep(Math.min(5000, 500 * attempt));
          continue;
        }
      }
    }

    throw lastError || new Error("Database schema is not ready.");
  })()
    .catch((error) => {
      ready = false;
      throw error;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

module.exports = {
  ensureSchema,
  verifySchema,
  REQUIRED_TABLES,
  STEPS,
};
