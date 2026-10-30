const pool = require('../config/db')

function createError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function validateInput({ scheduleId, classType, passengerCount }) {
  if (
    (typeof scheduleId !== 'number' && typeof scheduleId !== 'string') ||
    !/^[1-9]\d*$/.test(String(scheduleId)) ||
    !Number.isSafeInteger(Number(scheduleId))
  ) {
    throw createError('A valid schedule ID is required.', 400)
  }
  if (
    typeof classType !== 'string' ||
    !['1A', '2A', '3A', 'SL', 'CC', '2S'].includes(classType)
  ) {
    throw createError('A valid travel class is required.', 400)
  }
  if (!Number.isSafeInteger(passengerCount) || passengerCount < 1) {
    throw createError('Passenger count must be a positive integer.', 400)
  }
}

async function calculateFare({ scheduleId, classType, passengerCount }) {
  validateInput({ scheduleId, classType, passengerCount })

  const [rows] = await pool.execute(
    `SELECT sc.schedule_id AS scheduleId,
            f.class_type AS classType,
            f.amount AS unitFare,
            f.currency AS currency
     FROM schedules sc
     LEFT JOIN fares f
       ON f.schedule_id = sc.schedule_id
      AND f.class_type = ?
     WHERE sc.schedule_id = ?
       AND sc.status = 'SCHEDULED'`,
    [classType, scheduleId],
  )

  if (rows.length === 0) {
    throw createError('Scheduled journey not found.', 404)
  }
  const row = rows[0]
  if (row.unitFare === null || row.unitFare === undefined) {
    throw createError('No fare is configured for this schedule and class.', 404)
  }

  const fareText = String(row.unitFare)
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(fareText)) {
    throw createError('Configured fare is invalid.', 500)
  }
  const [whole, fractional = ''] = fareText.split('.')
  const unitFareCents = Number(whole) * 100 + Number(fractional.padEnd(2, '0'))
  const totalCents = unitFareCents * passengerCount
  if (!Number.isSafeInteger(totalCents) || totalCents > 9_999_999_999) {
    throw createError('Calculated fare exceeds the supported amount.', 400)
  }

  return {
    scheduleId: row.scheduleId,
    classType: row.classType,
    passengerCount,
    unitFare: (unitFareCents / 100).toFixed(2),
    totalFare: (totalCents / 100).toFixed(2),
    currency: row.currency,
  }
}

module.exports = { calculateFare }
