const jwt = require("jsonwebtoken");

exports.verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Access denied",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access only",
    });
  }

  next();
};

exports.staffOnly = (req, res, next) => {
  if (req.user.role !== "staff" && req.user.role !== "user") {
    return res.status(403).json({
      message: "Staff access only",
    });
  }

  next();
};