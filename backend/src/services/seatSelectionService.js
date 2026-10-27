
const pool = require('../config/db')

const VALID_CLASSES = ['1A', '2A', '3A', 'SL', 'CC', '2S']

function createError(message, statusCode) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function validateScheduleId(scheduleId) {
  if (
    !/^[1-9]\d*$/.test(String(scheduleId)) ||
    !Number.isSafeInteger(Number(scheduleId))
  ) {
    throw createError('A valid schedule ID is required.', 400)
  }
}

function validateClassType(classType) {
  if (
    typeof classType !== 'string' ||
    !VALID_CLASSES.includes(classType)
  ) {
    throw createError('A valid travel class is required.', 400)
  }
}

async function getClassesForSchedule(scheduleId) {
  validateScheduleId(scheduleId)

  const [schedules] = await pool.execute(
    `SELECT schedule_id
     FROM schedules
     WHERE schedule_id = ?
       AND status = 'SCHEDULED'`,
    [scheduleId],
  )

  if (schedules.length === 0) {
    throw createError('Scheduled journey not found.', 404)
  }

  const [classes] = await pool.execute(
    `SELECT
       f.class_type AS classType,
       f.amount AS fare,
       f.currency AS currency,
       COUNT(DISTINCT c.coach_id) AS coachCount,
       COUNT(DISTINCT CASE
         WHEN s.status = 'AVAILABLE'
          AND NOT EXISTS (
            SELECT 1
            FROM booking_seats bs
            WHERE bs.seat_id = s.seat_id
              AND bs.allocation_status IN ('HELD', 'CONFIRMED')
          )
         THEN s.seat_id
       END) AS availableSeats
     FROM fares f
     LEFT JOIN coaches c
       ON c.schedule_id = f.schedule_id
      AND c.class_type = f.class_type
     LEFT JOIN seats s ON s.coach_id = c.coach_id
     WHERE f.schedule_id = ?
     GROUP BY f.fare_id, f.class_type, f.amount, f.currency
     ORDER BY FIELD(f.class_type, '1A', '2A', '3A', 'SL', 'CC', '2S')`,
    [scheduleId],
  )

  return classes
}

async function getSeatsForClass(scheduleId, classType) {
  validateScheduleId(scheduleId)
  validateClassType(classType)

  const [rows] = await pool.execute(
    `SELECT
       c.coach_id AS coachId,
       c.coach_number AS coachNumber,
       c.class_type AS classType,
       s.seat_id AS seatId,
       s.seat_number AS seatNumber,
       s.berth_type AS berthType,
       CASE
         WHEN s.status = 'BLOCKED' THEN FALSE
         WHEN EXISTS (
           SELECT 1
           FROM booking_seats bs
           WHERE bs.seat_id = s.seat_id
             AND bs.allocation_status IN ('HELD', 'CONFIRMED')
         ) THEN FALSE
         ELSE TRUE
       END AS available
     FROM schedules sc
     JOIN coaches c ON c.schedule_id = sc.schedule_id
     JOIN seats s ON s.coach_id = c.coach_id
     WHERE sc.schedule_id = ?
       AND sc.status = 'SCHEDULED'
       AND c.class_type = ?
     ORDER BY c.coach_number, s.seat_number`,
    [scheduleId, classType],
  )

  if (rows.length === 0) {
    const [schedules] = await pool.execute(
      `SELECT schedule_id
       FROM schedules
       WHERE schedule_id = ?
         AND status = 'SCHEDULED'`,
      [scheduleId],
    )

    if (schedules.length === 0) {
      throw createError('Scheduled journey not found.', 404)
    }

    return []
  }

  return rows.map((seat) => ({
    ...seat,
    available: Boolean(seat.available),
  }))
}

module.exports = {
  getClassesForSchedule,
  getSeatsForClass,
}
