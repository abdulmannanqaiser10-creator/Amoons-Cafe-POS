const express = require("express");
const qz = require("../controllers/qzController");

const router = express.Router();

router.get("/certificate", qz.getCertificate);
router.post("/sign", qz.signRequest);

module.exports = router;
