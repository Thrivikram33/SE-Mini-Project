const express = require('express')
const bcrypt = require('bcryptjs')
const { body, validationResult } = require('express-validator')
const pool = require('../config/db')

const router = express.Router()

// Log in a passenger or administrator.
router.post(
  '/login',
  [
    body('email')
      .isString()
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address.'),
    body('password')
      .isString()
      .notEmpty()
      .withMessage('Password is required.'),
  ],
  async (req, res) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: 'Invalid login details.',
        errors: errors.array(),
      })
    }

    const email = req.body.email.trim().toLowerCase()
    const { password } = req.body

    try {
      const [users] = await pool.execute(
        `SELECT user_id, name, email, password_hash, role
         FROM users
         WHERE email = ?
         LIMIT 1`,
        [email],
      )

      const user = users[0]

      if (
        !user ||
        !(await bcrypt.compare(password, user.password_hash))
      ) {
        return res.status(401).json({
          message: 'Invalid email or password.',
        })
      }

      if (!req.session) {
        return res.status(500).json({
          message: 'Session support is not configured.',
        })
      }

      // Regenerate the session to prevent session fixation.
      req.session.regenerate((regenerateError) => {
        if (regenerateError) {
          return res.status(500).json({
            message: 'Login could not be completed.',
          })
        }

        req.session.user = {
          userId: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role,
        }

        req.session.save((saveError) => {
          if (saveError) {
            return res.status(500).json({
              message: 'Login could not be completed.',
            })
          }

          return res.status(200).json({
            message: 'Login successful.',
            user: req.session.user,
          })
        })
      })
    } catch (error) {
      console.error(
        'Login failed:',
        error.code || 'UNKNOWN_ERROR',
      )

      return res.status(500).json({
        message: 'Login could not be completed.',
      })
    }
  },
)

// Log out and invalidate the current session.
router.post('/logout', (req, res) => {
  if (!req.session) {
    return res.status(200).json({
      message: 'Logged out successfully.',
    })
  }

  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        message: 'Logout could not be completed.',
      })
    }

    res.clearCookie('rrs.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })

    return res.status(200).json({
      message: 'Logged out successfully.',
    })
  })
})

module.exports = router
