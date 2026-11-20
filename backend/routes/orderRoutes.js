const express = require("express");
const router = express.Router();

const { verifyToken, adminOnly } = require("../middleware/authMiddleware");
const orders = require("../controllers/orderController");
const reversals = require("../controllers/reversalController");

router.get("/", verifyToken, orders.list);
router.get("/stats", verifyToken, orders.stats);
router.get("/:id", verifyToken, orders.getOne);

router.post("/", verifyToken, orders.create);

router.put("/:id", verifyToken, orders.update);
router.patch("/:id/status", verifyToken, orders.updateStatus);
router.post("/:id/complete", verifyToken, orders.complete);
router.patch("/:id/payment", verifyToken, orders.updatePayment);
router.post("/:id/cancel", verifyToken, orders.cancel);
router.post("/:id/reverse", verifyToken, reversals.reverse);
router.delete("/:id", verifyToken, adminOnly, orders.remove);

module.exports = router;
