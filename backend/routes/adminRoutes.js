const express = require("express");
const router = express.Router();

const catalog = require("../controllers/catalogController");
const inventory = require("../controllers/inventoryController");
const staff = require("../controllers/staffController");
const loyalty = require("../controllers/loyaltyController");
const customers = require("../controllers/customerController");
const reports = require("../controllers/reportController");
const srb = require("../controllers/srbController");
const { verifyToken, adminOnly } = require("../middleware/authMiddleware");

// Everything under /api/admin is manager-only, so the guard is applied once
// here rather than repeated per route.
router.use(verifyToken, adminOnly);

/* Categories */
router.get("/categories", catalog.listCategories);
router.post("/categories", catalog.createCategory);
router.put("/categories/:id", catalog.updateCategory);
router.delete("/categories/:id", catalog.deleteCategory);

/* Products */
router.get("/products", catalog.listProducts);
router.post("/products", catalog.createProduct);
router.put("/products/:id", catalog.updateProduct);
router.delete("/products/:id", catalog.deleteProduct);

/* Inventory */
router.get("/inventory", inventory.list);
router.get("/inventory/:productId/movements", inventory.movements);
router.post("/inventory/:productId/adjust", inventory.adjust);
router.put("/inventory/:productId", inventory.updateItem);

/* Staff */
router.get("/staff", staff.list);
router.post("/staff", staff.create);
router.put("/staff/:id", staff.update);
router.delete("/staff/:id", staff.remove);

/* Loyalty */
router.get("/loyalty", loyalty.list);
router.get("/loyalty/redemptions/recent", loyalty.redemptions);
router.get("/loyalty/:id", loyalty.detail);
router.post("/loyalty", loyalty.create);
router.put("/loyalty/:id", loyalty.update);
router.post("/loyalty/:id/entries", loyalty.addEntry);
router.delete("/loyalty/:id", loyalty.remove);

/* Customers (synced with website + POS orders) */
router.get("/customers", customers.list);
router.get("/customers/:id", customers.detail);
router.post("/customers/:id/redeem", customers.redeem);

/* Reports */
router.get("/reports", reports.overview);

/* SRB fiscalisation */
router.get("/srb/status", srb.status);
router.post("/srb/test", srb.test);
router.post("/srb/orders/:id/submit", srb.submitOrder);

module.exports = router;
