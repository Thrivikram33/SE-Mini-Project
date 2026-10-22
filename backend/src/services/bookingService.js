const { randomInt } = require('node:crypto')
const pool = require('../config/db')

const PNR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PNR_LENGTH = 12
const PNR_ATTEMPTS = 5

function generatePnr() {
  let pnr = ''

  for (let index = 0; index < PNR_LENGTH; index += 1) {
    pnr += PNR_ALPHABET[randomInt(PNR_ALPHABET.length)]
  }

  return pnr
}

function isDuplicatePnrError(error) {
  return error && error.code === 'ER_DUP_ENTRY' &&
    String(error.message).includes('uq_bookings_pnr')
}

async function createBooking({ userId, scheduleId, totalFare }) {
  if (!Number.isSafeInteger(Number(userId)) || Number(userId) < 1) {
    const error = new Error('A valid passenger account is required.')
    error.statusCode = 400
    throw error
  }

  if (!Number.isSafeInteger(Number(scheduleId)) || Number(scheduleId) < 1) {
    const error = new Error('A valid schedule ID is required.')
    error.statusCode = 400
    throw error
  }

  const fare = Number(totalFare)
  if (!Number.isFinite(fare) || fare < 0 || !Number.isSafeInteger(Math.round(fare * 100))) {
    const error = new Error('A valid non-negative fare is required.')
    error.statusCode = 400
    throw error
  }

  for (let attempt = 0; attempt < PNR_ATTEMPTS; attempt += 1) {
    const pnr = generatePnr()

    try {
      const [result] = await pool.execute(
        `INSERT INTO bookings (pnr, user_id, schedule_id, total_fare)
         VALUES (?, ?, ?, ?)`,
        [pnr, Number(userId), Number(scheduleId), fare.toFixed(2)],
      )

      return {
        bookingId: result.insertId,
        pnr,
        status: 'PENDING_PAYMENT',
        totalFare: fare.toFixed(2),
      }
    } catch (error) {
      if (isDuplicatePnrError(error)) {
        continue
      }

      throw error
    }
  }

  const error = new Error('Could not generate a unique PNR. Please try again.')
  error.statusCode = 503
  throw error
}

module.exports = { createBooking, generatePnr }