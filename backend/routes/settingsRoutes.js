const express = require("express");
const router = express.Router();

const { verifyToken, adminOnly } = require("../middleware/authMiddleware");
const settings = require("../controllers/settingsController");
const business = require("../controllers/businessController");

router.get("/printer", verifyToken, settings.getPrinter);
router.put("/printer", verifyToken, settings.savePrinter);
router.delete("/printer", verifyToken, settings.resetPrinter);

// Every terminal reads these to render the same totals and bills; only a
// manager may change what those numbers are.
router.get("/company", verifyToken, adminOnly, business.company);
router.put("/:key", verifyToken, adminOnly, business.save);
router.delete("/:key", verifyToken, adminOnly, business.reset);

module.exports = router;
