import { ApiError } from '../shared/apiError.js'

const safeId = (value, field = 'id') => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) throw new ApiError(400, 'INVALID_ID', `${field} must be a positive integer.`)
  return id
}
const dateFormat = /^\d{4}-\d{2}-\d{2}$/
const timeFormat = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const classFormat = /^[A-Z0-9]{2,12}$/
const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

function isDate(value) {
  if (!dateFormat.test(value || '')) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function cleanStops(stops) {
  if (!Array.isArray(stops) || stops.length < 2 || stops.length > 100) throw new ApiError(400, 'INVALID_ROUTE', 'A route needs between 2 and 100 ordered stops.')
  const seen = new Set()
  return stops.map((stop, index) => {
    const code = String(stop.stationCode || '').trim().toUpperCase()
    const arrival = stop.arrivalTime ? String(stop.arrivalTime) : null
    const departure = stop.departureTime ? String(stop.departureTime) : null
    if (!/^[A-Z0-9]{2,10}$/.test(code) || seen.has(code)) throw new ApiError(400, 'INVALID_ROUTE', 'Route station codes must be valid and unique.')
    if ((arrival && !timeFormat.test(arrival)) || (departure && !timeFormat.test(departure))) throw new ApiError(400, 'INVALID_ROUTE_TIME', 'Route times must use 24-hour HH:mm or HH:mm:ss format.')
    if (index === 0 && !departure) throw new ApiError(400, 'INVALID_ROUTE_TIME', 'The first stop needs a departure time.')
    if (index === stops.length - 1 && !arrival) throw new ApiError(400, 'INVALID_ROUTE_TIME', 'The last stop needs an arrival time.')
    if (index > 0 && index < stops.length - 1 && !arrival && !departure) throw new ApiError(400, 'INVALID_ROUTE_TIME', 'Intermediate stops need an arrival or departure time.')
    seen.add(code)
    return { code, arrival, departure }
  })
}

function cleanClasses(classes) {
  if (!Array.isArray(classes) || !classes.length || classes.length > 12) throw new ApiError(400, 'INVALID_CLASSES', 'Provide between 1 and 12 travel classes.')
  const seen = new Set()
  return classes.map((item) => {
    const classType = String(item.classType || '').trim().toUpperCase()
    const amount = Number(item.fare)
    if (!classFormat.test(classType) || seen.has(classType)) throw new ApiError(400, 'INVALID_CLASS', 'Travel class codes must be valid and unique.')
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) throw new ApiError(400, 'INVALID_FARE', 'Fare must be a valid non-negative amount.')
    seen.add(classType)
    return { classType, amount: Math.round(amount * 100) / 100 }
  })
}

function cleanInventory(inventory, classes = null) {
  if (!Array.isArray(inventory) || !inventory.length || inventory.length > 100) throw new ApiError(400, 'INVALID_INVENTORY', 'Provide at least one coach and no more than 100 coaches.')
  const classTypes = classes ? new Set(classes.map((item) => item.classType)) : null
  const coachNumbers = new Set()
  return inventory.map((coach) => {
    const classType = String(coach.classType || '').trim().toUpperCase()
    const coachNumber = String(coach.coachNumber || '').trim().toUpperCase()
    const coachIdentity = `${classType}:${coachNumber}`
    if ((classTypes && !classTypes.has(classType)) || !/^[A-Z0-9-]{1,12}$/.test(coachNumber) || coachNumbers.has(coachIdentity)) {
      throw new ApiError(400, 'INVALID_COACH', 'Each coach must have a unique number and a configured class.')
    }
    if (!Array.isArray(coach.seats) || !coach.seats.length || coach.seats.length > 100) throw new ApiError(400, 'INVALID_SEATS', 'Each coach needs between 1 and 100 seats.')
    const seatNumbers = new Set()
    const seats = coach.seats.map((seat) => {
      const seatNumber = String(seat.seatNumber || '').trim().toUpperCase()
      const berthType = seat.berthType ? String(seat.berthType).trim().toUpperCase() : null
      if (!/^[A-Z0-9-]{1,12}$/.test(seatNumber) || seatNumbers.has(seatNumber) || (berthType && berthType.length > 24)) {
        throw new ApiError(400, 'INVALID_SEAT', 'Seat numbers must be unique and valid within a coach.')
      }
      seatNumbers.add(seatNumber)
      return { seatNumber, berthType }
    })
    coachNumbers.add(coachIdentity)
    return { classType, coachNumber, seats }
  })
}

async function audit(connection, actor, action, entity, id) {
  await connection.execute(
    'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
    [actor, action, entity, String(id)],
  )
}

export function createAdminService(db, { today = () => new Date().toISOString().slice(0, 10) } = {}) {
  return {
    async listTrains() {
      const [rows] = await db.execute('SELECT train_id AS trainId, train_number AS trainNumber, train_name AS trainName, active FROM trains ORDER BY train_number')
      return rows
    },
    async getRoute(value) {
      const trainId = safeId(value, 'trainId')
      const [rows] = await db.execute(
        `SELECT rs.sequence_no AS sequence, st.code AS stationCode, st.name AS stationName,
          st.city, rs.arrival_time AS arrivalTime, rs.departure_time AS departureTime
         FROM route_stops rs JOIN stations st ON st.station_id = rs.station_id
         WHERE rs.train_id = ? ORDER BY rs.sequence_no`,
        [trainId],
      )
      return rows
    },
    async createTrain(input, actor) {
      const trainNumber = String(input.trainNumber || '').trim().toUpperCase()
      const trainName = String(input.trainName || '').trim()
      if (!/^[A-Z0-9-]{2,12}$/.test(trainNumber) || trainName.length < 2 || trainName.length > 160) {
        throw new ApiError(400, 'INVALID_TRAIN', 'Enter a valid train number and a name from 2 to 160 characters.')
      }
      const connection = await db.getConnection()
      try {
        await connection.beginTransaction()
        const [result] = await connection.execute('INSERT INTO trains (train_number, train_name) VALUES (?, ?)', [trainNumber, trainName])
        await audit(connection, actor, 'TRAIN_CREATED', 'train', result.insertId)
        await connection.commit()
        return { trainId: result.insertId, trainNumber, trainName, active: true }
      } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'TRAIN_EXISTS', 'A train with that number already exists.')
        throw error
      } finally { connection.release() }
    },
    async updateTrain(value, input, actor) {
      const trainId = safeId(value, 'trainId')
      const updates = {}
      if (input.trainName !== undefined) {
        const name = String(input.trainName).trim()
        if (name.length < 2 || name.length > 160) throw new ApiError(400, 'INVALID_TRAIN', 'Train name must be from 2 to 160 characters.')
        updates.train_name = name
      }
      if (input.active !== undefined) {
        if (typeof input.active !== 'boolean') throw new ApiError(400, 'INVALID_TRAIN', 'Active must be true or false.')
        updates.active = input.active
      }
      const fields = Object.keys(updates)
      if (!fields.length) throw new ApiError(400, 'EMPTY_UPDATE', 'Provide a train name or active status to update.')
      const connection = await db.getConnection()
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute('SELECT train_id FROM trains WHERE train_id = ? FOR UPDATE', [trainId])
        if (!rows.length) throw new ApiError(404, 'TRAIN_NOT_FOUND', 'Train was not found.')
        await connection.execute(`UPDATE trains SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE train_id = ?`, [...fields.map((field) => updates[field]), trainId])
        await audit(connection, actor, 'TRAIN_UPDATED', 'train', trainId)
        await connection.commit()
        return { trainId, ...updates }
      } catch (error) {
        await connection.rollback()
        throw error
      } finally { connection.release() }
    },
    async updateRoute(value, input, actor) {
      const trainId = safeId(value, 'trainId')
      const stops = cleanStops(input.stops)
      const connection = await db.getConnection()
      try {
        await connection.beginTransaction()
        const [trains] = await connection.execute('SELECT train_id FROM trains WHERE train_id = ? FOR UPDATE', [trainId])
        if (!trains.length) throw new ApiError(404, 'TRAIN_NOT_FOUND', 'Train was not found.')
        const [bookings] = await connection.execute(
          `SELECT b.booking_id FROM bookings b JOIN schedules sch ON sch.schedule_id = b.schedule_id
           WHERE sch.train_id = ? AND b.status = 'CONFIRMED' LIMIT 1 FOR UPDATE`,
          [trainId],
        )
        if (bookings.length) throw new ApiError(409, 'ROUTE_HAS_BOOKINGS', 'Route cannot change while confirmed bookings exist for this train.')
        const codes = stops.map((stop) => stop.code)
        const [stations] = await connection.execute(
          `SELECT station_id AS stationId, code FROM stations WHERE active = TRUE AND code IN (${codes.map(() => '?').join(',')})`,
          codes,
        )
        if (stations.length !== codes.length) throw new ApiError(400, 'INVALID_ROUTE_STATION', 'Every route station must exist and be active.')
        const stationIds = new Map(stations.map((station) => [station.code, station.stationId]))
        await connection.execute('DELETE FROM route_stops WHERE train_id = ?', [trainId])
        for (let index = 0; index < stops.length; index += 1) {
          const stop = stops[index]
          await connection.execute(
            'INSERT INTO route_stops (train_id, station_id, sequence_no, arrival_time, departure_time) VALUES (?, ?, ?, ?, ?)',
            [trainId, stationIds.get(stop.code), index + 1, stop.arrival, stop.departure],
          )
        }
        await audit(connection, actor, 'TRAIN_ROUTE_UPDATED', 'train', trainId)
        await connection.commit()
        return { trainId, stops: stops.map((stop, index) => ({ ...stop, sequence: index + 1 })) }
      } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'ROUTE_CONFLICT', 'Route could not be saved because it conflicts with existing data.')
        throw error
      } finally { connection.release() }
    },
    async createSchedule(input, actor) {
      const trainId = safeId(input.trainId, 'trainId')
      const journeyDate = String(input.journeyDate || '')
      const classes = cleanClasses(input.classes)
      const inventory = cleanInventory(input.inventory, classes)
      if (!isDate(journeyDate) || journeyDate < today()) throw new ApiError(400, 'INVALID_DATE', 'Journey date must be valid and today or later.')
      const connection = await db.getConnection()
      try {
        await connection.beginTransaction()
        const [trains] = await connection.execute('SELECT train_id FROM trains WHERE train_id = ? AND active = TRUE FOR UPDATE', [trainId])
        if (!trains.length) throw new ApiError(404, 'TRAIN_NOT_FOUND', 'An active train with this ID was not found.')
        const [route] = await connection.execute('SELECT route_stop_id FROM route_stops WHERE train_id = ? LIMIT 2 FOR UPDATE', [trainId])
        if (route.length < 2) throw new ApiError(409, 'ROUTE_REQUIRED', 'Configure at least two route stops before creating a schedule.')
        const [schedule] = await connection.execute('INSERT INTO schedules (train_id, journey_date) VALUES (?, ?)', [trainId, journeyDate])
        const scheduleId = schedule.insertId
        for (const fare of classes) {
          await connection.execute('INSERT INTO fares (schedule_id, class_type, amount) VALUES (?, ?, ?)', [scheduleId, fare.classType, fare.amount])
        }
        const coachSet = new Set()
        for (const coach of inventory) {
          const identity = `${coach.classType}:${coach.coachNumber}`
          if (coachSet.has(identity)) throw new ApiError(400, 'INVALID_COACH', 'Coach numbers must be unique within each class.')
          coachSet.add(identity)
          const [createdCoach] = await connection.execute(
            'INSERT INTO coaches (schedule_id, class_type, coach_number) VALUES (?, ?, ?)',
            [scheduleId, coach.classType, coach.coachNumber],
          )
          for (const seat of coach.seats) {
            await connection.execute('INSERT INTO seats (coach_id, seat_number, berth_type) VALUES (?, ?, ?)', [createdCoach.insertId, seat.seatNumber, seat.berthType])
          }
        }
        await audit(connection, actor, 'SCHEDULE_CREATED', 'schedule', scheduleId)
        await connection.commit()
        return { scheduleId, trainId, journeyDate, status: 'SCHEDULED', classes, inventory: inventory.map(({ classType, coachNumber, seats }) => ({ classType, coachNumber, seatCount: seats.length })) }
      } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'SCHEDULE_EXISTS', 'This train already has a schedule for that date or duplicate inventory.')
        throw error
      } finally { connection.release() }
    },
    async updateSchedule(value, input, actor) {
      const scheduleId = safeId(value, 'scheduleId')
      const allowedStatuses = new Set(['SCHEDULED', 'CANCELLED', 'INACTIVE'])
      const status = input.status
      if (status !== undefined && !allowedStatuses.has(status)) throw new ApiError(400, 'INVALID_STATUS', 'Schedule status must be SCHEDULED, CANCELLED, or INACTIVE.')
      const fares = input.classes === undefined ? null : cleanClasses(input.classes)
      const inventoryInput = input.inventory
      if (inventoryInput !== undefined && (!inventoryInput || typeof inventoryInput !== 'object')) {
        throw new ApiError(400, 'INVALID_INVENTORY', 'Inventory must be an array or an inventory object.')
      }
      const inventoryCoaches = inventoryInput === undefined ? null
        : Array.isArray(inventoryInput) ? cleanInventory(inventoryInput, fares)
          : inventoryInput.coaches === undefined ? null : cleanInventory(inventoryInput.coaches, fares)
      const rawDeactivateIds = inventoryInput && !Array.isArray(inventoryInput) ? inventoryInput.deactivateSeatIds || [] : []
      if (!Array.isArray(rawDeactivateIds)) throw new ApiError(400, 'INVALID_SEAT', 'deactivateSeatIds must be an array.')
      const deactivateSeatIds = rawDeactivateIds.map(Number)
      if (deactivateSeatIds.some((id) => !Number.isSafeInteger(id) || id < 1) || new Set(deactivateSeatIds).size !== deactivateSeatIds.length) {
        throw new ApiError(400, 'INVALID_SEAT', 'Seat IDs to deactivate must be unique positive integers.')
      }
      const hasInventoryChange = inventoryCoaches !== null || deactivateSeatIds.length > 0
      if (status === undefined && fares === null && !hasInventoryChange) throw new ApiError(400, 'EMPTY_UPDATE', 'Provide schedule status, classes/fares, or inventory to update.')
      const connection = await db.getConnection()
      try {
        await connection.beginTransaction()
        const [rows] = await connection.execute('SELECT schedule_id FROM schedules WHERE schedule_id = ? FOR UPDATE', [scheduleId])
        if (!rows.length) throw new ApiError(404, 'SCHEDULE_NOT_FOUND', 'Schedule was not found.')
        if (status && status !== 'SCHEDULED') {
          const [confirmed] = await connection.execute("SELECT booking_id FROM bookings WHERE schedule_id = ? AND status = 'CONFIRMED' LIMIT 1 FOR UPDATE", [scheduleId])
          if (confirmed.length) throw new ApiError(409, 'SCHEDULE_HAS_BOOKINGS', 'Schedule cannot be cancelled or deactivated while confirmed bookings exist.')
        }
        if (status) await connection.execute('UPDATE schedules SET status = ? WHERE schedule_id = ?', [status, scheduleId])
        if (fares) {
          for (const fare of fares) {
            await connection.execute(
              `INSERT INTO fares (schedule_id, class_type, amount) VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE amount = VALUES(amount)`,
              [scheduleId, fare.classType, fare.amount],
            )
          }
        }
        if (inventoryCoaches) {
          const [classes] = await connection.execute('SELECT class_type AS classType FROM fares WHERE schedule_id = ?', [scheduleId])
          const validClasses = new Set(classes.map((item) => item.classType))
          const identitySet = new Set()
          for (const coach of inventoryCoaches) {
            if (!validClasses.has(coach.classType)) throw new ApiError(400, 'INVALID_CLASS', 'Configure the class fare before adding its inventory.')
            const identity = `${coach.classType}:${coach.coachNumber}`
            if (identitySet.has(identity)) throw new ApiError(400, 'INVALID_COACH', 'Coach numbers must be unique within each class.')
            identitySet.add(identity)
            const [existing] = await connection.execute('SELECT coach_id AS coachId FROM coaches WHERE schedule_id = ? AND coach_number = ? FOR UPDATE', [scheduleId, coach.coachNumber])
            let coachId = existing[0]?.coachId
            if (coachId) {
              const [existingCoach] = await connection.execute('SELECT class_type AS classType FROM coaches WHERE coach_id = ? FOR UPDATE', [coachId])
              if (existingCoach[0].classType !== coach.classType) {
                const [booked] = await connection.execute("SELECT seat_id FROM seats WHERE coach_id = ? AND status IN ('BOOKED', 'HELD') LIMIT 1 FOR UPDATE", [coachId])
                if (booked.length) throw new ApiError(409, 'COACH_HAS_BOOKINGS', 'A coach with booked seats cannot change travel class.')
                await connection.execute('UPDATE coaches SET class_type = ? WHERE coach_id = ?', [coach.classType, coachId])
              }
            } else {
              const [created] = await connection.execute('INSERT INTO coaches (schedule_id, class_type, coach_number) VALUES (?, ?, ?)', [scheduleId, coach.classType, coach.coachNumber])
              coachId = created.insertId
            }
            for (const seat of coach.seats) {
              const [existingSeats] = await connection.execute('SELECT seat_id, status FROM seats WHERE coach_id = ? AND seat_number = ? FOR UPDATE', [coachId, seat.seatNumber])
              if (existingSeats[0] && ['BOOKED', 'HELD'].includes(existingSeats[0].status)) continue
              if (existingSeats[0]) {
                await connection.execute("UPDATE seats SET berth_type = ?, status = 'AVAILABLE' WHERE seat_id = ?", [seat.berthType, existingSeats[0].seat_id])
              } else {
                await connection.execute('INSERT INTO seats (coach_id, seat_number, berth_type) VALUES (?, ?, ?)', [coachId, seat.seatNumber, seat.berthType])
              }
            }
          }
        }
        if (deactivateSeatIds.length) {
          const [seats] = await connection.execute(
            `SELECT se.seat_id AS seatId, se.status FROM seats se JOIN coaches co ON co.coach_id = se.coach_id
             WHERE co.schedule_id = ? AND se.seat_id IN (${deactivateSeatIds.map(() => '?').join(',')}) FOR UPDATE`,
            [scheduleId, ...deactivateSeatIds],
          )
          if (seats.length !== deactivateSeatIds.length || seats.some((seat) => seat.status !== 'AVAILABLE')) {
            throw new ApiError(409, 'SEAT_NOT_DEACTIVATABLE', 'Only available seats in this schedule can be deactivated.')
          }
          await connection.execute(
            `UPDATE seats SET status = 'INACTIVE' WHERE status = 'AVAILABLE' AND seat_id IN (${deactivateSeatIds.map(() => '?').join(',')})`,
            deactivateSeatIds,
          )
        }
        await audit(connection, actor, 'SCHEDULE_UPDATED', 'schedule', scheduleId)
        await connection.commit()
        return { scheduleId, status: status || 'UNCHANGED', fares, inventory: inventoryCoaches?.map((coach) => ({ classType: coach.classType, coachNumber: coach.coachNumber, seatCount: coach.seats.length })), deactivatedSeatIds: deactivateSeatIds }
      } catch (error) {
        await connection.rollback()
        if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'SCHEDULE_CONFLICT', 'Schedule change conflicts with existing data.')
        throw error
      } finally { connection.release() }
    },
    async listSchedules(query = {}) {
      const conditions = []
      const params = []
      if (query.date !== undefined) {
        const date = String(query.date)
        if (!isDate(date)) throw new ApiError(400, 'INVALID_DATE', 'Date filter must use YYYY-MM-DD.')
        conditions.push('sch.journey_date = ?')
        params.push(date)
      }
      if (query.trainId !== undefined) {
        const trainId = safeId(query.trainId, 'trainId')
        conditions.push('sch.train_id = ?')
        params.push(trainId)
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const [rows] = await db.execute(
        `SELECT sch.schedule_id AS scheduleId, sch.journey_date AS journeyDate, sch.status,
          tr.train_id AS trainId, tr.train_number AS trainNumber, tr.train_name AS trainName,
          fa.class_type AS classType, fa.amount AS fare,
          COUNT(DISTINCT CASE WHEN se.status = 'AVAILABLE' THEN se.seat_id END) AS availableSeats
         FROM schedules sch JOIN trains tr ON tr.train_id = sch.train_id
         LEFT JOIN fares fa ON fa.schedule_id = sch.schedule_id
         LEFT JOIN coaches co ON co.schedule_id = sch.schedule_id AND co.class_type = fa.class_type
         LEFT JOIN seats se ON se.coach_id = co.coach_id
         ${where}
         GROUP BY sch.schedule_id, sch.journey_date, sch.status, tr.train_id, tr.train_number,
          tr.train_name, fa.class_type, fa.amount
         ORDER BY sch.journey_date DESC, tr.train_number, fa.class_type`,
        params,
      )
      return rows.map((row) => ({ ...row, scheduleId: Number(row.scheduleId), trainId: Number(row.trainId), fare: row.fare === null ? null : Number(row.fare), availableSeats: Number(row.availableSeats), journeyDate: dateOnly(row.journeyDate) }))
    },
    async listBookings(query = {}) {
      const conditions = []
      const params = []
      if (query.status !== undefined) {
        const status = String(query.status).toUpperCase()
        if (!['PENDING', 'CONFIRMED', 'CANCELLED', 'PAYMENT_FAILED'].includes(status)) throw new ApiError(400, 'INVALID_STATUS', 'Booking status filter is invalid.')
        conditions.push('b.status = ?')
        params.push(status)
      }
      if (query.pnr !== undefined) {
        const pnr = String(query.pnr).trim().toUpperCase()
        if (!/^[A-Z0-9]{1,10}$/.test(pnr)) throw new ApiError(400, 'INVALID_PNR', 'PNR filter is invalid.')
        conditions.push('b.pnr = ?')
        params.push(pnr)
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const [rows] = await db.execute(
        `SELECT b.booking_id AS bookingId, b.pnr, b.status, b.total_fare AS totalFare,
          b.class_type AS classType, b.created_at AS createdAt,
          tr.train_number AS trainNumber, tr.train_name AS trainName,
          sch.journey_date AS journeyDate, origin.code AS originCode, destination.code AS destinationCode,
          u.user_id AS userId, u.name AS userName, u.email,
          COUNT(DISTINCT p.passenger_id) AS passengerCount
         FROM bookings b JOIN users u ON u.user_id = b.user_id
         JOIN schedules sch ON sch.schedule_id = b.schedule_id
         JOIN trains tr ON tr.train_id = sch.train_id
         JOIN stations origin ON origin.station_id = b.origin_station_id
         JOIN stations destination ON destination.station_id = b.destination_station_id
         LEFT JOIN passengers p ON p.booking_id = b.booking_id ${where}
         GROUP BY b.booking_id, b.pnr, b.status, b.total_fare, b.class_type, b.created_at,
          tr.train_number, tr.train_name, sch.journey_date, origin.code, destination.code,
          u.user_id, u.name, u.email
         ORDER BY b.created_at DESC LIMIT 200`,
        params,
      )
      return rows.map((row) => ({ ...row, bookingId: Number(row.bookingId), userId: Number(row.userId), totalFare: Number(row.totalFare), passengerCount: Number(row.passengerCount), journeyDate: dateOnly(row.journeyDate) }))
    },
    async listAuditLogs(value = 100) {
      const limit = Math.max(1, Math.min(200, Number.isSafeInteger(Number(value)) ? Number(value) : 100))
      const [rows] = await db.execute(
        `SELECT a.audit_id AS auditId, a.action, a.entity_type AS entityType,
          a.entity_id AS entityId, a.details, a.created_at AS createdAt,
          u.user_id AS actorUserId, u.name AS actorName, u.email AS actorEmail
         FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_user_id
         ORDER BY a.created_at DESC LIMIT ?`,
        [limit],
      )
      return rows
    },
  }
}
