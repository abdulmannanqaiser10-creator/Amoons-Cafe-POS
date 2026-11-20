require("dotenv").config();

const db = require("./config/db");
const bcrypt = require("bcryptjs");

const accounts = [
  { name: "Admin", pin: "24680", role: "admin", canReverse: true },
  { name: "Maaz", pin: "12345", role: "staff", canReverse: true },
];

async function seedUsers() {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    for (const { name, pin, role, canReverse } of accounts) {
      const pinHash = await bcrypt.hash(pin, 10);
      const existing = await client.query(
        `SELECT id FROM users
          WHERE lower(trim(display_name)) = lower($1)
          ORDER BY id`,
        [name]
      );

      if (existing.rowCount > 1) {
        throw new Error(`More than one account is named ${name}; resolve the duplicates before seeding.`);
      }

      const currentId = existing.rows[0]?.id ?? null;
      const others = await client.query(
        `SELECT id, pin_hash FROM users
          WHERE ($1::int IS NULL OR id <> $1)`,
        [currentId]
      );
      for (const account of others.rows) {
        if (await bcrypt.compare(pin, account.pin_hash)) {
          throw new Error(`The requested PIN for ${name} is already assigned to another account.`);
        }
      }

      if (existing.rowCount === 1) {
        await client.query(
          `UPDATE users
              SET pin_hash = $1, role = $2, can_reverse = $3
            WHERE id = $4`,
          [pinHash, role, canReverse, existing.rows[0].id]
        );
      } else {
        await client.query(
          `INSERT INTO users (pin_hash, role, display_name, can_reverse)
           VALUES ($1, $2, $3, $4)`,
          [pinHash, role, name, canReverse]
        );
      }
    }

    await client.query("COMMIT");
    console.log("Seed complete: Admin and Maaz accounts are ready.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

seedUsers().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exitCode = 1;
});
