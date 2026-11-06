const bcrypt = require('bcryptjs')

const DEFAULT_ROUNDS = 12
const MIN_ROUNDS = 12
const MAX_ROUNDS = 15

function configuredRounds() {
  const value = process.env.PASSWORD_BCRYPT_ROUNDS

  if (value === undefined || value === '') {
    return DEFAULT_ROUNDS
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('PASSWORD_BCRYPT_ROUNDS must be an integer from 12 to 15.')
  }

  const rounds = Number(value)
  if (!Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
    throw new Error('PASSWORD_BCRYPT_ROUNDS must be an integer from 12 to 15.')
  }

  return rounds
}

async function hashPassword(password) {
  return bcrypt.hash(password, configuredRounds())
}

async function verifyPassword(password, passwordHash) {
  if (typeof passwordHash !== 'string' || passwordHash.length === 0) {
    return false
  }

  try {
    return await bcrypt.compare(password, passwordHash)
  } catch {
    return false
  }
}

module.exports = { hashPassword, verifyPassword }
