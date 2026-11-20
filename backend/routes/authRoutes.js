const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/authMiddleware");
const { login, me } = require("../controllers/authController");

router.post("/login", login);
router.get("/me", verifyToken, me);

module.exports = router;