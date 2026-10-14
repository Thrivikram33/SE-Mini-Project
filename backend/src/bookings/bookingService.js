import { randomInt, randomUUID } from 'node:crypto'
import { ApiError } from '../shared/apiError.js'

const pnrAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const genders = new Set(['F', 'M', 'X', 'UNSPECIFIED'])
const makePnr = () => Array.from({ length: 10 }, () => pnrAlphabet[randomInt(pnrAlphabet.length)]).join('')
const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

function normalize(input) {
  const scheduleId = Number(input.scheduleId)
  const classType = String(input.classType || '').trim().toUpperCase()
  const source = String(input.source || '').trim().toUpperCase()
  const destination = String(input.destination || '').trim().toUpperCase()
  const passengers = Array.isArray(input.passengers) ? input.passengers : []
  const seatIds = Array.isArray(input.seatIds) ? input.seatIds.map(Number) : []
  const errors = {}
  if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) errors.scheduleId = 'Choose a valid schedule.'
  if (!/^[A-Z0-9]{2,12}$/.test(classType)) errors.classType = 'Choose a valid travel class.'
  if (!/^[A-Z0-9]{2,10}$/.test(source) || !/^[A-Z0-9]{2,10}$/.test(destination) || source === destination) errors.route = 'Choose a valid origin and destination.'
  if (!passengers.length || passengers.length > 6) errors.passengers = 'Enter between 1 and 6 passengers.'
  if (passengers.length !== seatIds.length || seatIds.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(seatIds).size !== seatIds.length) {
    errors.seatIds = 'Select one distinct available seat for each passenger.'
  }
  const cleanPassengers = passengers.map((passenger, index) => {
    const name = String(passenger?.name || '').trim()
    const age = Number(passenger?.age)
    const gender = String(passenger?.gender || 'UNSPECIFIED').toUpperCase()
    if (name.length < 2 || name.length > 120 || /[\u0000-\u001f]/.test(name)) errors[`passengers.${index}.name`] = 'Enter a passenger name between 2 and 120 characters.'
    if (!Number.isInteger(age) || age < 0 || age > 120) errors[`passengers.${index}.age`] = 'Enter a valid age from 0 to 120.'
    if (!genders.has(gender)) errors[`passengers.${index}.gender`] = 'Choose a valid gender option.'
    return { name, age, gender }
  })
  if (input.paymentOutcome !== undefined && !['success', 'failure'].includes(input.paymentOutcome)) {
    errors.paymentOutcome = 'Payment simulator outcome must be success or failure.'
  }
  if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the booking details.', errors)
  return { scheduleId, classType, source, destination, passengers: cleanPassengers, seatIds, paymentOutcome: input.paymentOutcome }
}

export function createBookingService(db, paymentSimulator, options = {}) {
  const pnrFactory = options.pnrFactory || makePnr
  const today = options.today || (() => new Date().toISOString().slice(0, 10))
  return {
    async create(userId, input) {
      const booking = normalize(input)
      const connection = await db.getConnection()
      let transactionOpen = false
      try {
        await connection.beginTransaction()
        transactionOpen = true
        const [schedules] = await connection.execute(
          `SELECT sch.schedule_id AS scheduleId, sch.journey_date AS journeyDate,
            sch.status AS scheduleStatus, tr.train_number AS trainNumber, tr.train_name AS trainName,
            fa.amount AS fare
           FROM schedules sch
           JOIN trains tr ON tr.train_id = sch.train_id AND tr.active = TRUE
           JOIN fares fa ON fa.schedule_id = sch.schedule_id AND fa.class_type = ?
           WHERE sch.schedule_id = ? FOR UPDATE`,
          [booking.classType, booking.scheduleId],
        )
        const schedule = schedules[0]
        if (!schedule || schedule.scheduleStatus !== 'SCHEDULED' || dateOnly(schedule.journeyDate) < today()) {
          throw new ApiError(404, 'SCHEDULE_NOT_FOUND', 'This schedule is not available for booking.')
        }
        const [routes] = await connection.execute(
          `SELECT origin_station.station_id AS originStationId, destination_station.station_id AS destinationStationId,
            origin_station.code AS originCode, origin_station.name AS originName,
            destination_station.code AS destinationCode, destination_station.name AS destinationName
           FROM route_stops origin_stop
           JOIN stations origin_station ON origin_station.station_id = origin_stop.station_id AND origin_station.code = ?
           JOIN route_stops destination_stop ON destination_stop.train_id = origin_stop.train_id
             AND destination_stop.sequence_no > origin_stop.sequence_no
           JOIN stations destination_station ON destination_station.station_id = destination_stop.station_id AND destination_station.code = ?
           WHERE origin_stop.train_id = (SELECT train_id FROM schedules WHERE schedule_id = ?)
           LIMIT 1`,
          [booking.source, booking.destination, booking.scheduleId],
        )
        const route = routes[0]
        if (!route) throw new ApiError(400, 'INVALID_ROUTE', 'The selected stations are not on this train in that order.')
        const seatPlaceholders = booking.seatIds.map(() => '?').join(',')
        const [seats] = await connection.execute(
          `SELECT se.seat_id AS seatId, se.seat_number AS seatNumber, se.status,
            co.class_type AS classType, co.schedule_id AS scheduleId
           FROM seats se JOIN coaches co ON co.coach_id = se.coach_id
           WHERE se.seat_id IN (${seatPlaceholders}) ORDER BY se.seat_id FOR UPDATE`,
          booking.seatIds,
        )
        if (seats.length !== booking.seatIds.length || seats.some((seat) => seat.status !== 'AVAILABLE'
          || seat.classType !== booking.classType || Number(seat.scheduleId) !== booking.scheduleId)) {
          throw new ApiError(409, 'SEATS_UNAVAILABLE', 'One or more selected seats are no longer available.')
        }

        const unitFare = Number(schedule.fare)
        const totalFare = Math.round((unitFare * booking.passengers.length + Number.EPSILON) * 100) / 100
        const payment = await paymentSimulator.charge({ amount: totalFare, developmentOutcome: booking.paymentOutcome })
        const paymentReference = randomUUID()
        if (!payment.success) {
          const [failed] = await connection.execute(
            `INSERT INTO bookings (pnr, user_id, schedule_id, origin_station_id, destination_station_id, class_type, status, total_fare)
             VALUES (NULL, ?, ?, ?, ?, ?, 'PAYMENT_FAILED', ?)`,
            [userId, booking.scheduleId, route.originStationId, route.destinationStationId, booking.classType, totalFare],
          )
          await connection.execute(
            'INSERT INTO payments (booking_id, amount, status, reference) VALUES (?, ?, \'FAILED\', ?)',
            [failed.insertId, totalFare, paymentReference],
          )
          await connection.execute(
            'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
            [userId, 'PAYMENT_FAILED', 'booking', String(failed.insertId)],
          )
          await connection.commit()
          transactionOpen = false
          throw new ApiError(402, 'PAYMENT_FAILED', 'The simulated payment failed. No seats were reserved.')
        }

        let created
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            ;[created] = await connection.execute(
              `INSERT INTO bookings (pnr, user_id, schedule_id, origin_station_id, destination_station_id, class_type, status, total_fare)
               VALUES (?, ?, ?, ?, ?, ?, 'CONFIRMED', ?)`,
              [pnrFactory(), userId, booking.scheduleId, route.originStationId, route.destinationStationId, booking.classType, totalFare],
            )
            break
          } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error
          }
        }
        const passengerIds = []
        for (const passenger of booking.passengers) {
          const [result] = await connection.execute(
            'INSERT INTO passengers (booking_id, name, age, gender) VALUES (?, ?, ?, ?)',
            [created.insertId, passenger.name, passenger.age, passenger.gender],
          )
          passengerIds.push(result.insertId)
        }
        for (let index = 0; index < booking.seatIds.length; index += 1) {
          await connection.execute(
            'INSERT INTO booking_seats (booking_id, seat_id, passenger_id, allocation_status) VALUES (?, ?, ?, \'CONFIRMED\')',
            [created.insertId, booking.seatIds[index], passengerIds[index]],
          )
        }
        const [updated] = await connection.execute(
          `UPDATE seats SET status = 'BOOKED' WHERE seat_id IN (${seatPlaceholders}) AND status = 'AVAILABLE'`,
          booking.seatIds,
        )
        if (updated.affectedRows !== booking.seatIds.length) throw new ApiError(409, 'SEATS_UNAVAILABLE', 'One or more selected seats are no longer available.')
        await connection.execute(
          'INSERT INTO payments (booking_id, amount, status, reference) VALUES (?, ?, \'SUCCESS\', ?)',
          [created.insertId, totalFare, paymentReference],
        )
        await connection.execute(
          'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
          [userId, 'BOOKING_CONFIRMED', 'booking', String(created.insertId)],
        )
        const pnr = (await connection.execute('SELECT pnr FROM bookings WHERE booking_id = ?', [created.insertId]))[0][0].pnr
        await connection.commit()
        transactionOpen = false
        return {
          bookingId: created.insertId,
          pnr,
          status: 'CONFIRMED',
          trainNumber: schedule.trainNumber,
          trainName: schedule.trainName,
          originCode: route.originCode,
          originName: route.originName,
          destinationCode: route.destinationCode,
          destinationName: route.destinationName,
          journeyDate: dateOnly(schedule.journeyDate),
          classType: booking.classType,
          totalFare,
          passengers: booking.passengers.map((passenger, index) => ({ ...passenger, seatNumber: seats.find((seat) => Number(seat.seatId) === booking.seatIds[index]).seatNumber })),
        }
      } catch (error) {
        if (transactionOpen) await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
  }
}
