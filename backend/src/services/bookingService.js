const crypto = require('node:crypto')
const pool = require('../config/db')

const VALID_CLASSES = ['1A', '2A', '3A', 'SL', 'CC', '2S']
const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])

function createError(message, statusCode, code = 'REQUEST_FAILED') {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0
}

function normalizePassenger(passenger, index) {
  const name = typeof passenger?.name === 'string' ? passenger.name.trim() : ''
  const age = Number(passenger?.age)
  const gender = typeof passenger?.gender === 'string' ? passenger.gender.trim().toUpperCase() : 'UNDISCLOSED'

  if (name.length < 2 || name.length > 120) {
    throw createError(`Passenger ${index + 1} name must be between 2 and 120 characters.`, 400, 'INVALID_PASSENGER')
  }
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    throw createError(`Passenger ${index + 1} age must be between 1 and 120.`, 400, 'INVALID_PASSENGER')
  }
  if (!VALID_GENDERS.has(gender)) {
    throw createError(`Passenger ${index + 1} gender is invalid.`, 400, 'INVALID_PASSENGER')
  }

  return { name, age, gender }
}

function normalizeBookingRequest(input = {}) {
  const scheduleId = Number(input.scheduleId)
  const classType = typeof input.classType === 'string' ? input.classType.trim().toUpperCase() : ''

  if (!isPositiveInteger(scheduleId)) {
    throw createError('A valid schedule ID is required.', 400, 'INVALID_SCHEDULE')
  }
  if (!VALID_CLASSES.includes(classType)) {
    throw createError('A valid travel class is required.', 400, 'INVALID_CLASS')
  }

  const passengers = Array.isArray(input.passengers) ? input.passengers : []
  const seatIds = Array.isArray(input.seatIds) ? input.seatIds.map((seatId) => Number(seatId)) : []

  if (passengers.length === 0 || passengers.length > 6) {
    throw createError('A booking must include between 1 and 6 passengers.', 400, 'INVALID_PASSENGERS')
  }
  if (seatIds.length !== passengers.length) {
    throw createError('Each passenger must be assigned one valid seat.', 400, 'INVALID_SEAT_SELECTION')
  }
  if (seatIds.some((seatId) => !isPositiveInteger(seatId)) || new Set(seatIds).size !== seatIds.length) {
    throw createError('Seat selections must be unique positive integers.', 400, 'INVALID_SEAT_SELECTION')
  }

  return {
    scheduleId,
    classType,
    passengers: passengers.map((passenger, index) => normalizePassenger(passenger, index)),
    seatIds,
    paymentOutcome: input.paymentOutcome === 'failure' ? 'failure' : input.paymentOutcome === 'success' ? 'success' : undefined,
  }
}

function generatePnr() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  return Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('')
}

async function withTransaction(handler) {
  const connectionSource = typeof pool.getConnection === 'function' ? await pool.getConnection() : pool
  const connection = connectionSource || pool

  try {
    if (connection && typeof connection.beginTransaction === 'function') {
      await connection.beginTransaction()
    }
    const result = await handler(connection)
    if (connection && typeof connection.commit === 'function') {
      await connection.commit()
    }
    return result
  } catch (error) {
    if (connection && typeof connection.rollback === 'function') {
      await connection.rollback().catch(() => {})
    }
    throw error
  } finally {
    if (connection && typeof connection.release === 'function') {
      connection.release()
    }
  }
}

async function findBookingById(connection, bookingId) {
  const [rows] = await connection.execute(
    `SELECT booking_id AS bookingId,
            pnr,
            user_id AS userId,
            schedule_id AS scheduleId,
            status,
            total_fare AS totalFare
     FROM bookings
     WHERE booking_id = ?`,
    [bookingId],
  )
  return rows[0] || null
}

async function ensureSeatsAvailable(connection, scheduleId, classType, seatIds) {
  const placeholders = seatIds.map(() => '?').join(', ')
  const [seatRows] = await connection.execute(
    `SELECT s.seat_id AS seatId,
            s.status AS seatStatus,
            c.class_type AS classType,
            c.schedule_id AS scheduleId
     FROM seats s
     JOIN coaches c ON c.coach_id = s.coach_id
     WHERE s.seat_id IN (${placeholders})
     FOR UPDATE`,
    seatIds,
  )

  if (seatRows.length !== seatIds.length) {
    throw createError('One or more selected seats do not exist.', 404, 'SEAT_NOT_FOUND')
  }

  const invalidSeats = seatRows.filter(
    (seat) => seat.seatStatus !== 'AVAILABLE' || seat.classType !== classType || Number(seat.scheduleId) !== Number(scheduleId),
  )
  if (invalidSeats.length > 0) {
    throw createError('One or more selected seats are unavailable for this schedule and class.', 409, 'SEAT_UNAVAILABLE')
  }

  const [activeRows] = await connection.execute(
    `SELECT seat_id AS seatId
     FROM booking_seats
     WHERE seat_id IN (${placeholders})
       AND allocation_status IN ('HELD', 'CONFIRMED')`,
    seatIds,
  )

  if (activeRows.length > 0) {
    throw createError('One or more selected seats are already allocated to an active booking.', 409, 'SEAT_ALREADY_ALLOCATED')
  }
}

async function setBookingStatus(connection, bookingId, status, releaseAllocations = false) {
  await connection.execute(
    `UPDATE bookings
     SET status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE booking_id = ?`,
    [status, bookingId],
  )

  if (releaseAllocations) {
    await connection.execute(
      `UPDATE booking_seats
       SET allocation_status = 'RELEASED', released_at = CURRENT_TIMESTAMP
       WHERE booking_id = ?
         AND allocation_status IN ('HELD', 'CONFIRMED')`,
      [bookingId],
    )
  }
}

async function createBooking(input = {}, userId) {
  const normalized = normalizeBookingRequest(input)

  if (!isPositiveInteger(userId)) {
    throw createError('A valid passenger user ID is required.', 400, 'INVALID_USER')
  }

  return withTransaction(async (connection) => {
    const [scheduleRows] = await connection.execute(
      `SELECT schedule_id AS scheduleId, status
       FROM schedules
       WHERE schedule_id = ?
       FOR UPDATE`,
      [normalized.scheduleId],
    )

    if (scheduleRows.length === 0) {
      throw createError('Scheduled journey not found.', 404, 'SCHEDULE_NOT_FOUND')
    }
    if (scheduleRows[0].status !== 'SCHEDULED') {
      throw createError('This journey is not currently scheduled for booking.', 409, 'SCHEDULE_UNAVAILABLE')
    }

    const [userRows] = await connection.execute(
      `SELECT user_id AS userId
       FROM users
       WHERE user_id = ?`,
      [userId],
    )
    if (userRows.length === 0) {
      throw createError('Passenger account not found.', 404, 'USER_NOT_FOUND')
    }

    const [fareRows] = await connection.execute(
      `SELECT amount, currency
       FROM fares
       WHERE schedule_id = ?
         AND class_type = ?
       FOR UPDATE`,
      [normalized.scheduleId, normalized.classType],
    )
    if (fareRows.length === 0) {
      throw createError('No fare is configured for this schedule and class.', 404, 'FARE_NOT_FOUND')
    }

    await ensureSeatsAvailable(connection, normalized.scheduleId, normalized.classType, normalized.seatIds)

    const totalFare = Number(fareRows[0].amount) * normalized.passengers.length
    let bookingRecord = null
    let pnr = generatePnr()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [result] = await connection.execute(
          `INSERT INTO bookings (pnr, user_id, schedule_id, status, total_fare)
           VALUES (?, ?, ?, 'PENDING_PAYMENT', ?)`,
          [pnr, userId, normalized.scheduleId, totalFare],
        )
        bookingRecord = result
        break
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY' || attempt === 4) {
          throw error
        }
        pnr = generatePnr()
      }
    }

    const bookingId = bookingRecord.insertId
    const passengerIds = []

    for (const passenger of normalized.passengers) {
      const [passengerInsert] = await connection.execute(
        `INSERT INTO passengers (booking_id, name, age, gender)
         VALUES (?, ?, ?, ?)`,
        [bookingId, passenger.name, passenger.age, passenger.gender],
      )
      passengerIds.push(passengerInsert.insertId)
    }

    for (let index = 0; index < normalized.seatIds.length; index += 1) {
      await connection.execute(
        `INSERT INTO booking_seats (booking_id, seat_id, passenger_id, allocation_status)
         VALUES (?, ?, ?, 'HELD')`,
        [bookingId, normalized.seatIds[index], passengerIds[index]],
      )
    }

    const paymentOutcome = normalized.paymentOutcome
    if (paymentOutcome === 'failure') {
      await setBookingStatus(connection, bookingId, 'PAYMENT_FAILED', true)
      return {
        bookingId,
        pnr,
        status: 'PAYMENT_FAILED',
        scheduleId: normalized.scheduleId,
        totalFare,
        passengerCount: normalized.passengers.length,
        allocationStatus: 'RELEASED',
        seats: normalized.seatIds,
      }
    }

    if (paymentOutcome === 'success') {
      await setBookingStatus(connection, bookingId, 'CONFIRMED')
      await connection.execute(
        `UPDATE booking_seats
         SET allocation_status = 'CONFIRMED', released_at = NULL
         WHERE booking_id = ?
           AND allocation_status = 'HELD'`,
        [bookingId],
      )
      return {
        bookingId,
        pnr,
        status: 'CONFIRMED',
        scheduleId: normalized.scheduleId,
        totalFare,
        passengerCount: normalized.passengers.length,
        allocationStatus: 'CONFIRMED',
        seats: normalized.seatIds,
      }
    }

    return {
      bookingId,
      pnr,
      status: 'PENDING_PAYMENT',
      scheduleId: normalized.scheduleId,
      totalFare,
      passengerCount: normalized.passengers.length,
      allocationStatus: 'HELD',
      seats: normalized.seatIds,
    }
  })
}

async function confirmBooking(bookingId) {
  if (!isPositiveInteger(bookingId)) {
    throw createError('A valid booking ID is required.', 400, 'INVALID_BOOKING')
  }

  return withTransaction(async (connection) => {
    const booking = await findBookingById(connection, bookingId)
    if (!booking) {
      throw createError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
    }

    await connection.execute(
      `UPDATE bookings
       SET status = 'CONFIRMED', updated_at = CURRENT_TIMESTAMP
       WHERE booking_id = ?
         AND status IN ('PENDING_PAYMENT', 'CONFIRMED')`,
      [bookingId],
    )

    await connection.execute(
      `UPDATE booking_seats
       SET allocation_status = 'CONFIRMED', released_at = NULL
       WHERE booking_id = ?
         AND allocation_status IN ('HELD', 'CONFIRMED')`,
      [bookingId],
    )

    return {
      bookingId: Number(bookingId),
      status: 'CONFIRMED',
      pnr: booking.pnr,
      seatsAllocated: true,
    }
  })
}

async function releaseHeldAllocations(bookingId) {
  if (!isPositiveInteger(bookingId)) {
    throw createError('A valid booking ID is required.', 400, 'INVALID_BOOKING')
  }

  return withTransaction(async (connection) => {
    const booking = await findBookingById(connection, bookingId)
    if (!booking) {
      throw createError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
    }

    await setBookingStatus(connection, bookingId, 'PAYMENT_FAILED', true)

    return {
      bookingId: Number(bookingId),
      status: 'PAYMENT_FAILED',
      allocationsReleased: true,
      pnr: booking.pnr,
    }
  })
}

async function allocateSeat({ bookingId, passengerId, seatId }) {
  if (!isPositiveInteger(bookingId) || !isPositiveInteger(passengerId) || !isPositiveInteger(seatId)) {
    throw createError('Booking ID, passenger ID, and seat ID are required.', 400, 'INVALID_ALLOCATION')
  }

  return withTransaction(async (connection) => {
    const [bookingRows] = await connection.execute(
      `SELECT booking_id AS bookingId, schedule_id AS scheduleId, status
       FROM bookings
       WHERE booking_id = ?
       FOR UPDATE`,
      [bookingId],
    )
    if (bookingRows.length === 0) {
      throw createError('Booking not found.', 404, 'BOOKING_NOT_FOUND')
    }

    const [passengerRows] = await connection.execute(
      `SELECT passenger_id AS passengerId, booking_id AS bookingId
       FROM passengers
       WHERE passenger_id = ?
         AND booking_id = ?`,
      [passengerId, bookingId],
    )
    if (passengerRows.length === 0) {
      throw createError('Passenger was not found for this booking.', 404, 'PASSENGER_NOT_FOUND')
    }

    const [seatRows] = await connection.execute(
      `SELECT s.seat_id AS seatId,
              s.status AS seatStatus,
              c.class_type AS classType,
              c.schedule_id AS scheduleId
       FROM seats s
       JOIN coaches c ON c.coach_id = s.coach_id
       WHERE s.seat_id = ?
       FOR UPDATE`,
      [seatId],
    )
    if (seatRows.length === 0) {
      throw createError('Seat not found.', 404, 'SEAT_NOT_FOUND')
    }
    const seat = seatRows[0]
    if (seat.seatStatus !== 'AVAILABLE' || seat.classType !== 'SL' || Number(seat.scheduleId) !== Number(bookingRows[0].scheduleId)) {
      throw createError('Seat is unavailable for this booking.', 409, 'SEAT_UNAVAILABLE')
    }

    const [activeRows] = await connection.execute(
      `SELECT booking_seat_id AS bookingSeatId
       FROM booking_seats
       WHERE seat_id = ?
         AND allocation_status IN ('HELD', 'CONFIRMED')`,
      [seatId],
    )
    if (activeRows.length > 0) {
      throw createError('Seat is already allocated to an active booking.', 409, 'SEAT_ALREADY_ALLOCATED')
    }

    const [result] = await connection.execute(
      `INSERT INTO booking_seats (booking_id, seat_id, passenger_id, allocation_status)
       VALUES (?, ?, ?, 'HELD')`,
      [bookingId, seatId, passengerId],
    )

    return {
      bookingSeatId: result.insertId,
      bookingId: Number(bookingId),
      passengerId: Number(passengerId),
      seatId: Number(seatId),
      allocationStatus: 'HELD',
    }
  })
}

async function getBookingAllocations(bookingId) {
  if (!isPositiveInteger(bookingId)) {
    throw createError('A valid booking ID is required.', 400, 'INVALID_BOOKING')
  }

  const [rows] = await pool.execute(
    `SELECT bs.booking_seat_id AS bookingSeatId,
            bs.booking_id AS bookingId,
            bs.seat_id AS seatId,
            bs.passenger_id AS passengerId,
            bs.allocation_status AS allocationStatus,
            bs.allocated_at AS allocatedAt,
            bs.released_at AS releasedAt,
            s.seat_number AS seatNumber,
            c.class_type AS classType,
            b.schedule_id AS scheduleId
     FROM booking_seats bs
     JOIN seats s ON s.seat_id = bs.seat_id
     JOIN coaches c ON c.coach_id = s.coach_id
     JOIN bookings b ON b.booking_id = bs.booking_id
     WHERE bs.booking_id = ?
     ORDER BY bs.booking_seat_id`,
    [bookingId],
  )

  return rows
}

module.exports = {
  createBooking,
  createError,
  confirmBooking,
  releaseHeldAllocations,
  releaseBookingAllocations: releaseHeldAllocations,
  allocateSeat,
  getBookingAllocations,
  normalizeBookingRequest,
  generatePnr,
}
