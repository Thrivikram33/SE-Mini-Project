const pool = require('../config/db')
const { hashPassword } = require('../utils/password')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MOBILE_REGEX = /^[+0-9()\-\s]+$/

async function registerPassenger({ name, email, mobile, password }) {
  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof mobile !== 'string' ||
    typeof password !== 'string'
  ) {
    const error = new Error(
      'Name, email, mobile number, and password are required.',
    )
    error.statusCode = 400
    throw error
  }

  const normalizedName = name.trim()
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedMobile = mobile.trim()

  if (normalizedName.length < 2 || normalizedName.length > 100) {
    const error = new Error('Name must contain 2 to 100 characters.')
    error.statusCode = 400
    throw error
  }

  if (
    normalizedEmail.length > 255 ||
    !EMAIL_REGEX.test(normalizedEmail)
  ) {
    const error = new Error('Please provide a valid email address.')
    error.statusCode = 400
    throw error
  }

  if (
    normalizedMobile.length < 1 ||
    normalizedMobile.length > 15 ||
    !MOBILE_REGEX.test(normalizedMobile)
  ) {
    const error = new Error('Please provide a valid mobile number.')
    error.statusCode = 400
    throw error
  }

  if (password.length < 8 || password.length > 72) {
    const error = new Error('Password must contain 8 to 72 characters.')
    error.statusCode = 400
    throw error
  }

  const passwordHash = await hashPassword(password)

  try {
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, mobile, password_hash)
       VALUES (?, ?, ?, ?)`,
      [normalizedName, normalizedEmail, normalizedMobile, passwordHash],
    )

    return {
      userId: result.insertId,
      name: normalizedName,
      email: normalizedEmail,
      mobile: normalizedMobile,
      role: 'PASSENGER',
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const duplicateError = new Error(
        'An account with this email or mobile number already exists.',
      )
      duplicateError.statusCode = 409
      throw duplicateError
    }

    throw error
  }
}

module.exports = { registerPassenger }