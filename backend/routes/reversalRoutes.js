const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const reversals = require("../controllers/reversalController");

// Staff (e.g. Maaz) and admin both need reversal history for Order Reversal / Shift Reports.
router.get("/", verifyToken, reversals.history);

module.exports = router;
