const express = require("express");
const digitalMenu = require("../controllers/digitalMenuController");

const router = express.Router();

router.get("/tables", digitalMenu.tables);
router.get("/catalogue", digitalMenu.catalogue);
router.post("/customer/register", digitalMenu.register);
router.get("/customer/me", digitalMenu.me);
router.post("/orders", digitalMenu.createOrder);

module.exports = router;
