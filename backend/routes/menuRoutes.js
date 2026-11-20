const express = require("express");
const router = express.Router();

const menu = require("../controllers/menuController");
const staff = require("../controllers/staffController");
const { verifyToken } = require("../middleware/authMiddleware");

// The till's menu source: whatever the admin panel has published.
router.get("/", verifyToken, menu.menu);

module.exports = router;
