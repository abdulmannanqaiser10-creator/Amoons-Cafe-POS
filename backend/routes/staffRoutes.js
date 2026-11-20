const express = require("express");
const router = express.Router();

const staff = require("../controllers/staffController");
const loyalty = require("../controllers/loyaltyController");
const { verifyToken } = require("../middleware/authMiddleware");

// Any signed-in account may rotate its own PIN; managing other people's PINs
// is an admin route under /api/admin/staff.
router.post("/change-pin", verifyToken, staff.changeOwnPin);
router.patch("/profile", verifyToken, staff.updateOwnProfile);

/** Loyalty phone lookup for the till (read-only). */
router.get("/loyalty/lookup", verifyToken, loyalty.lookupByPhone);

module.exports = router;
