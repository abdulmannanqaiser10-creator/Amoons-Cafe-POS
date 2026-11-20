const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const reversalRoutes = require("./routes/reversalRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const menuRoutes = require("./routes/menuRoutes");
const adminRoutes = require("./routes/adminRoutes");
const staffRoutes = require("./routes/staffRoutes");
const websiteRoutes = require("./routes/websiteRoutes");
const { ensureSchema } = require("./config/schema");
const { verifyToken, adminOnly } = require("./middleware/authMiddleware");

const app = express();

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error("Missing DATABASE_URL or JWT_SECRET in backend/.env");
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: "4mb" }));

// Kick schema prep on cold start, but never pin the process to a rejected
// promise — ensureSchema() retries after transient Neon / pool failures.
ensureSchema()
  .then(async () => {
    console.log("POS schema ready");
    try {
      const { bootstrapSrbFromEnv } = require("./services/srbService");
      await bootstrapSrbFromEnv(null);
    } catch (error) {
      console.error("SRB credential bootstrap skipped:", error.message);
    }
  })
  .catch((error) =>
    console.error("Initial schema prep failed (will retry on request):", error.message)
  );

app.use(async (_req, res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    console.error("Could not prepare POS schema:", error.message);
    res.status(503).json({
      message: "Database schema is not ready.",
      detail: process.env.VERCEL ? undefined : error.message,
    });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await ensureSchema();
    res.json({ ok: true, schema: "ready" });
  } catch (error) {
    res.status(503).json({ ok: false, schema: "not_ready", message: error.message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reversals", reversalRoutes);
app.use("/api/shifts", shiftRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/website", websiteRoutes);
app.use("/api/qz", require("./routes/qzRoutes"));

app.get("/api/home", verifyToken, (req, res) => {
  res.json({
    message: "Welcome to Home Page",
  });
});

app.get("/api/admin", verifyToken, adminOnly, (req, res) => {
  res.json({
    message: "Welcome to Admin Panel",
  });
});

module.exports = app;

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 5000;

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
