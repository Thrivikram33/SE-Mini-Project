
const express = require("express");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const pool = require("../config/db");

const router = express.Router();

router.post(
  "/register",
  [
    body("full_name")
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must contain 2–100 characters."),
    body("email")
      .trim()
      .isEmail()
      .normalizeEmail()
      .withMessage("Enter a valid email address."),
    body("mobile")
      .trim()
      .matches(/^[0-9]{10,15}$/)
      .withMessage("Mobile number must contain 10–15 digits."),
    body("password")
      .isLength({ min: 8, max: 72 })
      .withMessage("Password must contain 8–72 characters.")
  ],
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Invalid registration details.",
        errors: errors.array()
      });
    }

    const { full_name, email, mobile, password } = req.body;

    try {
      const passwordHash = await bcrypt.hash(password, 12);

      await pool.execute(
        `INSERT INTO users (full_name, email, mobile, password_hash)
         VALUES (?, ?, ?, ?)`,
        [full_name, email, mobile, passwordHash]
      );

      return res.status(201).json({
        message: "Passenger registered successfully."
      });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          message: "An account with this email already exists."
        });
      }

      console.error("Registration failed:", error.code || "UNKNOWN_ERROR");

      return res.status(500).json({
        message: "Registration could not be completed."
      });
    }
  }
);

module.exports = router;
