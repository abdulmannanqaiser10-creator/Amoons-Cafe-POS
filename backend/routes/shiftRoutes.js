const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const shifts = require("../controllers/shiftController");

// Fixed paths first: /options and /current would otherwise match /:id.
router.get("/options", verifyToken, shifts.options);
router.get("/current", verifyToken, shifts.current);

router.get("/", verifyToken, shifts.list);
router.post("/", verifyToken, shifts.open);

router.get("/:id", verifyToken, shifts.getOne);
router.patch("/:id/close", verifyToken, shifts.close);
router.post("/:id/cash-pulls", verifyToken, shifts.addCashPull);

module.exports = router;
