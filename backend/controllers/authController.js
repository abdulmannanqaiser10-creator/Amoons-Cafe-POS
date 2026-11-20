const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

exports.me = async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, role, display_name, email, can_reverse, is_active FROM users WHERE id = $1",
      [req.user.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Account no longer exists" });
    }

    // Deactivating a staff account has to end the sessions it already has,
    // otherwise the token keeps working for the rest of its 8 hours.
    if (user.is_active === false) {
      return res.status(401).json({ message: "This account has been deactivated" });
    }

    res.json({
      user: {
        id: user.id,
        role: user.role === "admin" ? "admin" : "staff",
        name: user.display_name || user.role,
        email: user.email || "",
        canReverse: user.can_reverse === true,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const pin = String(req.body?.pin ?? "").trim();

    if (!/^\d{5}$/.test(pin)) {
      return res.status(400).json({
        message: "Please enter a valid 5-digit PIN",
      });
    }

    const result = await db.query(
      "SELECT id, role, pin_hash, is_active FROM users ORDER BY is_active DESC, id"
    );

    const matches = [];

    for (const user of result.rows) {
      const isMatch = await bcrypt.compare(
        pin,
        user.pin_hash
      );

      if (isMatch) matches.push(user);
    }

    const activeMatches = matches.filter((user) => user.is_active !== false);
    if (activeMatches.length > 1) {
      return res.status(409).json({
        message: "This PIN is assigned to multiple active accounts. Ask a manager to reset one.",
      });
    }

    const matchedUser = activeMatches[0] || matches[0];
    if (!matchedUser) {
      return res.status(401).json({
        message: "Invalid PIN",
      });
    }

    if (matchedUser.is_active === false) {
      return res.status(403).json({
        message: "This account has been deactivated by a manager",
      });
    }

    const token = jwt.sign(
      {
        id: matchedUser.id,
        role: matchedUser.role === "admin" ? "admin" : "staff",
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login successful",
      token,
      role: matchedUser.role === "admin" ? "admin" : "staff",
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server error",
    });
  }
};