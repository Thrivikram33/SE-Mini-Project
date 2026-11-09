
const { randomBytes, randomUUID } = require('node:crypto')
const { createBookingQueryRepository } = require('../repositories/bookingQueryRepository')
const { validatePassengerDetails } = require('../validators/passengerDetailsValidator')
const { calculateRefund } = require('./refundCalculationService')

const CLASSES = new Set(['1A', '2A', '3A', 'SL', 'CC', '2S'])
const PNR_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function apiError(statusCode, code, message, details) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  if (details) error.details = details
  return error
}

function pnr() {
  return Array.from(
    randomBytes(12),
    (byte) => PNR_ALPHABET[byte % PNR_ALPHABET.length],
  ).join('')
}

function normalize(input) {
  const details = {}

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw apiError(400, 'VALIDATION_ERROR', 'A JSON booking request is required.', {
      request: 'A JSON object is required.',
    })
  }

  const scheduleId = input.scheduleId
  if (
    !/^[1-9]\d*$/.test(String(scheduleId)) ||
    !Number.isSafeInteger(Number(scheduleId))
  ) {
    details.scheduleId = 'Choose a valid schedule.'
  }

  const classType =
    typeof input.classType === 'string' ? input.classType.trim().toUpperCase() : ''

  if (!CLASSES.has(classType)) {
    details.classType = 'Choose a valid travel class.'
  }

  const source =
    typeof input.source === 'string' ? input.source.trim().toUpperCase() : ''

  const destination =
    typeof input.destination === 'string'
      ? input.destination.trim().toUpperCase()
      : ''

  if (!/^[A-Z0-9]{2,10}$/.test(source)) {
    details.source = 'Enter a valid origin station code.'
  }

  if (!/^[A-Z0-9]{2,10}$/.test(destination)) {
    details.destination = 'Enter a valid destination station code.'
  }

  if (source && source === destination) {
    details.destination = 'Origin and destination must differ.'
  }

  if (
    !Array.isArray(input.passengers) ||
    input.passengers.length < 1 ||
    input.passengers.length > 6
  ) {
    details.passengers = 'Enter between 1 and 6 passengers.'
  }

  if (
    !Array.isArray(input.seatIds) ||
    input.seatIds.length < 1 ||
    input.seatIds.length > 6
  ) {
    details.seatIds = 'Select one available seat for each passenger.'
  } else if (
    input.seatIds.some(
      (id) =>
        !/^[1-9]\d*$/.test(String(id)) ||
        !Number.isSafeInteger(Number(id)),
    ) ||
    new Set(input.seatIds.map(Number)).size !== input.seatIds.length
  ) {
    details.seatIds = 'Select distinct valid seat IDs.'
  }

  const passengers = Array.isArray(input.passengers) ? input.passengers : []

  passengers.forEach((passenger, index) => {
    const result = validatePassengerDetails(passenger)

    if (!result.valid) {
      Object.entries(result.errors).forEach(([field, message]) => {
        details[`passengers.${index}.${field}`] = message
      })
    }
  })

  if (
    Array.isArray(input.passengers) &&
    Array.isArray(input.seatIds) &&
    input.passengers.length !== input.seatIds.length
  ) {
    details.seatIds =
      'Select one distinct available seat for each passenger.'
  }

  if (
    input.paymentOutcome !== undefined &&
    !['success', 'failure'].includes(input.paymentOutcome)
  ) {
    details.paymentOutcome = 'Payment simulator outcome must be success or failure.'
  }

  if (Object.keys(details).length) {
    throw apiError(
      400,
      'VALIDATION_ERROR',
      'Please correct the booking details.',
      details,
    )
  }

  return {
    scheduleId: Number(scheduleId),
    classType,
    source,
    destination,
    passengers: passengers.map((passenger) => ({
      name: passenger.name.trim(),
      age: Number(passenger.age),
      gender: passenger.gender,
    })),
    seatIds: input.seatIds.map(Number),
    paymentOutcome: input.paymentOutcome,
  }
}

function dateOnly(value) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10)
}

function dateAtOrigin(scheduleDate, dayOffset) {
  const date = new Date(`${dateOnly(scheduleDate)}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + Number(dayOffset))
  return date.toISOString().slice(0, 10)
}

function normalizePassengerId(userId) {
  const id = Number(userId)
  if (!Number.isSafeInteger(id) || id < 1) {
    throw apiError(401, 'AUTH_REQUIRED', 'Authentication required.')
  }
  return id
}

function normalizeBookingId(bookingId) {
  const id = Number(bookingId)
  if (!/^[1-9]\d*$/.test(String(bookingId)) || !Number.isSafeInteger(id)) {
    throw apiError(400, 'VALIDATION_ERROR', 'A valid booking ID is required.')
  }
  return id
}

function createBookingService(db, paymentSimulator, options = {}) {
  const database = db || require('../config/db')
  const bookingQueries = options.bookingQueries || createBookingQueryRepository(database)
  const today = options.today || (() => new Date().toISOString().slice(0, 10))
  const makePnr = options.pnrFactory || pnr

  return {
    async create(userId, input) {
      const booking = normalize(input)
      const connection = await database.getConnection()
      let transactionOpen = false

      try {
        await connection.beginTransaction()
        transactionOpen = true

        const [schedules] = await connection.execute(
          `SELECT sc.schedule_id AS scheduleId,
                  sc.journey_date AS journeyDate,
                  sc.status AS scheduleStatus,
                  t.train_number AS trainNumber,
                  t.train_name AS trainName,
                  f.amount AS fare,
                  f.currency AS currency
           FROM schedules sc
           JOIN trains t ON t.train_id = sc.train_id AND t.active = TRUE
           JOIN fares f ON f.schedule_id = sc.schedule_id AND f.class_type = ?
           WHERE sc.schedule_id = ?
           FOR UPDATE`,
          [booking.classType, booking.scheduleId],
        )

        const schedule = schedules[0]

        if (!schedule || schedule.scheduleStatus !== 'SCHEDULED') {
          throw apiError(
            404,
            'SCHEDULE_NOT_FOUND',
            'This schedule is not available for booking.',
          )
        }

        const [routes] = await connection.execute(
          `SELECT os.station_id AS originStationId,
                  ds.station_id AS destinationStationId,
                  os.day_offset AS originDayOffset,
                  ost.code AS originCode,
                  ost.name AS originName,
                  dst.code AS destinationCode,
                  dst.name AS destinationName
           FROM schedules sc
           JOIN route_stops os ON os.train_id = sc.train_id
           JOIN stations ost ON ost.station_id = os.station_id
           JOIN route_stops ds
             ON ds.train_id = sc.train_id
            AND ds.sequence_no > os.sequence_no
           JOIN stations dst ON dst.station_id = ds.station_id
           WHERE sc.schedule_id = ?
             AND ost.code = ?
             AND dst.code = ?
           LIMIT 1`,
          [booking.scheduleId, booking.source, booking.destination],
        )

        const route = routes[0]

        if (!route) {
          throw apiError(
            400,
            'INVALID_ROUTE',
            'The selected stations are not on this train in that order.',
          )
        }

        const journeyDate = dateAtOrigin(
          schedule.journeyDate,
          route.originDayOffset,
        )

        if (journeyDate < today()) {
          throw apiError(
            404,
            'SCHEDULE_NOT_FOUND',
            'This schedule is not available for booking.',
          )
        }

        const placeholders = booking.seatIds.map(() => '?').join(', ')

        const [seats] = await connection.execute(
          `SELECT s.seat_id AS seatId,
                  s.seat_number AS seatNumber,
                  s.status,
                  c.class_type AS classType,
                  c.schedule_id AS scheduleId,
                  (SELECT COUNT(*)
                   FROM booking_seats bs
                   WHERE bs.seat_id = s.seat_id
                     AND bs.allocation_status IN ('HELD', 'CONFIRMED')
                  ) AS activeAllocation
           FROM seats s
           JOIN coaches c ON c.coach_id = s.coach_id
           WHERE s.seat_id IN (${placeholders})
           ORDER BY s.seat_id
           FOR UPDATE`,
          booking.seatIds,
        )

        if (
          seats.length !== booking.seatIds.length ||
          seats.some(
            (seat) =>
              seat.status !== 'AVAILABLE' ||
              seat.classType !== booking.classType ||
              Number(seat.scheduleId) !== booking.scheduleId ||
              Number(seat.activeAllocation) !== 0,
          )
        ) {
          throw apiError(
            409,
            'SEATS_UNAVAILABLE',
            'One or more selected seats are no longer available.',
          )
        }

        const totalCents =
          Math.round(Number(schedule.fare) * 100) * booking.passengers.length

        if (
          !Number.isSafeInteger(totalCents) ||
          totalCents < 0 ||
          totalCents > 9999999999
        ) {
          throw apiError(400, 'INVALID_FARE', 'The configured fare is invalid.')
        }

        const totalFare = (totalCents / 100).toFixed(2)

        const [created] = await connection.execute(
          `INSERT INTO bookings
             (pnr, user_id, schedule_id, origin_station_id,
              destination_station_id, class_type, status, total_fare)
           VALUES (NULL, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?)`,
          [
            userId,
            booking.scheduleId,
            route.originStationId,
            route.destinationStationId,
            booking.classType,
            totalFare,
          ],
        )

        const passengerIds = []

        for (const passenger of booking.passengers) {
          const [inserted] = await connection.execute(
            `INSERT INTO passengers
               (booking_id, name, age, gender)
             VALUES (?, ?, ?, ?)`,
            [
              created.insertId,
              passenger.name,
              passenger.age,
              passenger.gender,
            ],
          )

          passengerIds.push(inserted.insertId)
        }

        for (let index = 0; index < booking.seatIds.length; index += 1) {
          await connection.execute(
            `INSERT INTO booking_seats
               (booking_id, seat_id, passenger_id, allocation_status)
             VALUES (?, ?, ?, 'HELD')`,
            [
              created.insertId,
              booking.seatIds[index],
              passengerIds[index],
            ],
          )
        }

        const reference = randomUUID()

        const [payment] = await connection.execute(
          `INSERT INTO payments
             (booking_id, amount, status, reference)
           VALUES (?, ?, 'PENDING', ?)`,
          [created.insertId, totalFare, reference],
        )

        const result = await paymentSimulator.charge({
          amount: totalFare,
          outcome: booking.paymentOutcome,
        })

        if (!result.success) {
          await connection.execute(
            "UPDATE payments SET status = 'FAILED' WHERE payment_id = ?",
            [payment.insertId],
          )

          await connection.execute(
            `UPDATE booking_seats
             SET allocation_status = 'RELEASED',
                 released_at = CURRENT_TIMESTAMP
             WHERE booking_id = ?`,
            [created.insertId],
          )

          await connection.execute(
            "UPDATE bookings SET status = 'PAYMENT_FAILED' WHERE booking_id = ?",
            [created.insertId],
          )

          await connection.commit()
          transactionOpen = false

          throw apiError(
            402,
            'PAYMENT_FAILED',
            'The simulated payment failed. No seats were reserved.',
          )
        }

        let confirmedPnr
        let pnrAssigned = false

        for (let attempt = 0; attempt < 3; attempt += 1) {
          confirmedPnr = makePnr()

          try {
            const [updateResult] = await connection.execute(
              `UPDATE bookings
               SET pnr = ?, status = 'CONFIRMED'
               WHERE booking_id = ?
                 AND status = 'PENDING_PAYMENT'`,
              [confirmedPnr, created.insertId],
            )

            if (updateResult.affectedRows !== 1) {
              throw new Error('Booking could not be confirmed after payment.')
            }

            pnrAssigned = true
            break
          } catch (error) {
            const isPnrCollision =
              error.code === 'ER_DUP_ENTRY' &&
              String(error.message).includes('uq_bookings_pnr')

            if (!isPnrCollision || attempt === 2) {
              throw error
            }
          }
        }

        if (!pnrAssigned) {
          throw new Error('Unable to assign a unique booking PNR.')
        }

        await connection.execute(
          "UPDATE booking_seats SET allocation_status = 'CONFIRMED' WHERE booking_id = ?",
          [created.insertId],
        )

        await connection.execute(
          "UPDATE payments SET status = 'SUCCESS' WHERE payment_id = ?",
          [payment.insertId],
        )

        await connection.execute(
          `INSERT INTO audit_logs
             (actor_user_id, action, entity_type, entity_id)
           VALUES (?, ?, ?, ?)`,
          [
            userId,
            'BOOKING_CONFIRMED',
            'booking',
            String(created.insertId),
          ],
        )

        await connection.commit()
        transactionOpen = false

        return {
          bookingId: created.insertId,
          pnr: confirmedPnr,
          status: 'CONFIRMED',
          trainNumber: schedule.trainNumber,
          trainName: schedule.trainName,
          origin: {
            code: route.originCode,
            name: route.originName,
          },
          destination: {
            code: route.destinationCode,
            name: route.destinationName,
          },
          journeyDate,
          classType: booking.classType,
          totalFare,
          currency: schedule.currency,
          passengers: booking.passengers.map((passenger, index) => ({
            ...passenger,
            seatNumber: seats.find(
              (seat) =>
                Number(seat.seatId) === booking.seatIds[index],
            ).seatNumber,
          })),
        }
      } catch (error) {
        if (transactionOpen) {
          await connection.rollback()
        }
        throw error
      } finally {
        connection.release()
      }
    },

    async cancel(userId, bookingId) {
      const passengerId = normalizePassengerId(userId)
      const id = normalizeBookingId(bookingId)
      const connection = await database.getConnection()
      let transactionOpen = false

      try {
        await connection.beginTransaction()
        transactionOpen = true

        const [bookings] = await connection.execute(
          `SELECT b.booking_id AS bookingId,
                  b.user_id AS userId,
                  b.schedule_id AS scheduleId,
                  b.status AS status,
                  b.class_type AS classType,
                  b.origin_station_id AS originStationId,
                  s.journey_date AS journeyDate,
                  rs.departure_time AS departureTime,
                  rs.day_offset AS dayOffset
           FROM bookings b
           JOIN schedules s ON s.schedule_id = b.schedule_id
           JOIN route_stops rs
             ON rs.train_id = s.train_id
            AND rs.station_id = b.origin_station_id
           WHERE b.booking_id = ?
           FOR UPDATE`,
          [id],
        )

        const booking = bookings[0]

        if (!booking || Number(booking.userId) !== passengerId) {
          throw apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.')
        }

        if (booking.status !== 'CONFIRMED') {
          throw apiError(
            409,
            'BOOKING_NOT_CANCELLABLE',
            'This booking is not eligible for cancellation.',
          )
        }

        if (
          !booking.departureTime ||
          !booking.journeyDate ||
          !booking.classType
        ) {
          throw new Error('Required booking refund details are unavailable.')
        }

        await connection.execute(
          `SELECT schedule_id
           FROM schedules
           WHERE schedule_id = ?
           FOR UPDATE`,
          [booking.scheduleId],
        )

        const [passengers] = await connection.execute(
          `SELECT COUNT(*) AS passengerCount
           FROM passengers
           WHERE booking_id = ?`,
          [id],
        )

        const passengerCount = Number(passengers[0].passengerCount)

        if (!Number.isSafeInteger(passengerCount) || passengerCount < 1) {
          throw new Error('Valid booking passenger details are unavailable.')
        }

        const departureDate = new Date(
          `${dateOnly(booking.journeyDate)}T00:00:00.000Z`,
        )

        departureDate.setUTCDate(
          departureDate.getUTCDate() + Number(booking.dayOffset || 0),
        )

        const [hours, minutes, seconds] = String(booking.departureTime)
          .split(':')
          .map(Number)

        departureDate.setUTCHours(hours, minutes, seconds || 0, 0)

        const [payments] = await connection.execute(
          `SELECT amount
           FROM payments
           WHERE booking_id = ? AND status = 'SUCCESS'
           ORDER BY payment_id DESC
           LIMIT 1
           FOR UPDATE`,
          [id],
        )

        if (!payments.length) {
          throw new Error('Successful payment not found for confirmed booking.')
        }

        const refund = calculateRefund({
          totalPaid: payments[0].amount,
          passengerCount,
          classType: booking.classType,
          departureAt: departureDate,
        })

        const [allocations] = await connection.execute(
          `SELECT booking_seat_id AS bookingSeatId,
                  allocation_status AS status
           FROM booking_seats
           WHERE booking_id = ?
             AND allocation_status IN ('HELD', 'CONFIRMED')
           ORDER BY booking_seat_id
           FOR UPDATE`,
          [id],
        )

        if (allocations.length === 0) {
          throw new Error('Confirmed booking has no active seat allocations.')
        }

        const [bookingUpdate] = await connection.execute(
          `UPDATE bookings
           SET status = 'CANCELLED'
           WHERE booking_id = ? AND status = 'CONFIRMED'`,
          [id],
        )

        if (bookingUpdate.affectedRows !== 1) {
          throw apiError(
            409,
            'BOOKING_NOT_CANCELLABLE',
            'This booking is not eligible for cancellation.',
          )
        }

        const [allocationUpdate] = await connection.execute(
          `UPDATE booking_seats
           SET allocation_status = 'RELEASED',
               released_at = CURRENT_TIMESTAMP
           WHERE booking_id = ?
             AND allocation_status IN ('HELD', 'CONFIRMED')`,
          [id],
        )

        if (allocationUpdate.affectedRows !== allocations.length) {
          throw new Error('Not all active seat allocations were released.')
        }

        const [cancellation] = await connection.execute(
          `INSERT INTO cancellations
             (booking_id, refund_amount, refund_status)
           VALUES (?, ?, ?)`,
          [id, refund.refundAmount.toFixed(2), refund.refundStatus],
        )

        await connection.execute(
          `INSERT INTO audit_logs
             (actor_user_id, action, entity_type, entity_id, details)
           VALUES (?, ?, ?, ?, ?)`,
          [
            passengerId,
            'BOOKING_CANCELLED',
            'booking',
            String(id),
            JSON.stringify({
              refundAmount: refund.refundAmount,
              refundStatus: refund.refundStatus,
              currency: refund.currency,
            }),
          ],
        )

        await connection.commit()
        transactionOpen = false

        return {
          cancellationId: cancellation.insertId,
          bookingId: id,
          status: 'CANCELLED',
          releasedSeatCount: allocationUpdate.affectedRows,
          refundAmount: refund.refundAmount,
          refundStatus: refund.refundStatus,
          currency: refund.currency,
        }
      } catch (error) {
        if (transactionOpen) await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
    async getPassengerBookings(userId) {
      return bookingQueries.listForPassenger(normalizePassengerId(userId))
    },

    async getPassengerBookingByPnr(userId, pnrValue) {
      const passengerId = normalizePassengerId(userId)
      const normalizedPnr = String(pnrValue || '').trim().toUpperCase()
      if (!/^[A-Z0-9]{12}$/.test(normalizedPnr)) {
        throw apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.')
      }

      const booking = await bookingQueries.findPassengerBookingByPnr(
        normalizedPnr,
        passengerId,
      )
      if (!booking) {
        throw apiError(404, 'BOOKING_NOT_FOUND', 'Booking not found.')
      }
      return booking
    },
  }
}

module.exports = {
  createBookingService,
  generatePnr: pnr,
}
