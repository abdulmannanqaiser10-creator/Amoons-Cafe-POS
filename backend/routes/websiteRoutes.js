const express = require("express");
const router = express.Router();
const websiteOrders = require("../controllers/websiteOrderController");
const websiteCustomers = require("../controllers/websiteCustomerController");
const {
  requireWebsiteKey,
  optionalCustomer,
  requireCustomer,
} = require("../middleware/websiteAuth");

router.use(requireWebsiteKey);

router.post("/customer/register", websiteCustomers.register);
router.get("/customer/me", requireCustomer, websiteCustomers.me);
router.get("/customer/rewards", requireCustomer, websiteCustomers.rewards);

router.post("/orders", optionalCustomer, websiteOrders.create);

module.exports = router;
