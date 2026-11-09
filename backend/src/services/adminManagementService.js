const { createAdminManagementRepository } = require('../repositories/adminManagementRepository')

const CLASSES = new Set(['1A', '2A', '3A', 'SL', 'CC', '2S'])
const BERTH_TYPES = new Set(['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER', 'SEAT', 'NA'])
const SEAT_STATUSES = new Set(['AVAILABLE', 'BLOCKED'])
const SCHEDULE_STATUSES = new Set(['SCHEDULED', 'CANCELLED', 'COMPLETED'])

function clientError(statusCode, code, message, details) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  if (details) error.details = details
  return error
}

function requiredId(value, label) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw clientError(400, 'VALIDATION_ERROR', `${label} must be a positive integer.`)
  }
  return Number(value)
}

function requiredText(value, label, maxLength, pattern) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength || (pattern && !pattern.test(text))) {
    throw clientError(400, 'VALIDATION_ERROR', `${label} is invalid.`)
  }
  return text
}

function optionalTime(value, label) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) {
    throw clientError(400, 'VALIDATION_ERROR', `${label} must use HH:MM or HH:MM:SS.`)
  }
  return value.length === 5 ? `${value}:00` : value
}

function timeMinutes(value) {
  if (!value) return null
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function normalizeRouteStops(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) {
    throw clientError(400, 'VALIDATION_ERROR', 'A train route needs between 2 and 100 stops.')
  }
  const stops = value.map((stop, index) => {
    if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
      throw clientError(400, 'VALIDATION_ERROR', `Route stop ${index + 1} is invalid.`)
    }
    const stationCode = requiredText(stop.stationCode, `Route stop ${index + 1} station code`, 10, /^[A-Za-z0-9]{2,10}$/).toUpperCase()
    const arrivalTime = optionalTime(stop.arrivalTime, `Route stop ${index + 1} arrival time`)
    const departureTime = optionalTime(stop.departureTime, `Route stop ${index + 1} departure time`)
    const dayOffset = stop.dayOffset === undefined || stop.dayOffset === '' ? 0 : Number(stop.dayOffset)
    if (!Number.isInteger(dayOffset) || dayOffset < 0 || dayOffset > 7) {
      throw clientError(400, 'VALIDATION_ERROR', `Route stop ${index + 1} day offset must be from 0 to 7.`)
    }
    if (index === 0 && !departureTime) {
      throw clientError(400, 'VALIDATION_ERROR', 'The first route stop needs a departure time.')
    }
    if (index > 0 && !arrivalTime) {
      throw clientError(400, 'VALIDATION_ERROR', `Route stop ${index + 1} needs an arrival time.`)
    }
    return { stationCode, arrivalTime, departureTime, dayOffset }
  })
  const codes = stops.map((stop) => stop.stationCode)
  if (new Set(codes).size !== codes.length) {
    throw clientError(400, 'VALIDATION_ERROR', 'A station may appear only once on a train route.')
  }
  let previousMinute = -1
  for (const stop of stops) {
    const clockTime = timeMinutes(stop.departureTime || stop.arrivalTime)
    const journeyMinute = stop.dayOffset * 1440 + clockTime
    if (journeyMinute <= previousMinute) {
      throw clientError(400, 'VALIDATION_ERROR', 'Route stops must be in increasing journey-time order.')
    }
    previousMinute = journeyMinute
  }
  return stops
}

function normalizeTrain(input, routeRequired) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw clientError(400, 'VALIDATION_ERROR', 'A JSON train object is required.')
  }
  const trainNumber = requiredText(input.trainNumber, 'Train number', 10, /^[A-Za-z0-9-]+$/).toUpperCase()
  const trainName = requiredText(input.trainName, 'Train name', 150)
  let active = true
  if (input.active !== undefined) {
    if (input.active !== true && input.active !== false && input.active !== 1 && input.active !== 0) {
      throw clientError(400, 'VALIDATION_ERROR', 'Train active must be a boolean.')
    }
    active = Boolean(input.active)
  }
  return {
    trainNumber,
    trainName,
    active,
    routeStops: input.routeStops === undefined && !routeRequired
      ? undefined
      : normalizeRouteStops(input.routeStops),
  }
}

function normalizeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw clientError(400, 'VALIDATION_ERROR', 'Journey date must use YYYY-MM-DD format.')
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCFullYear(year, month - 1, day)
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw clientError(400, 'VALIDATION_ERROR', 'Journey date must be a valid calendar date.')
  }
  return value
}

function normalizeClass(value) {
  const classType = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!CLASSES.has(classType)) throw clientError(400, 'VALIDATION_ERROR', 'Travel class is invalid.')
  return classType
}

function normalizeFare(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw clientError(400, 'VALIDATION_ERROR', 'Fare details are required.')
  }
  const amountValue = input.amount
  if ((typeof amountValue !== 'number' && typeof amountValue !== 'string') || !/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(String(amountValue))) {
    throw clientError(400, 'VALIDATION_ERROR', 'Fare amount must be a non-negative amount with at most two decimals.')
  }
  const currency = requiredText(input.currency === undefined ? 'INR' : input.currency, 'Currency', 3, /^[A-Za-z]{3}$/).toUpperCase()
  return { classType: normalizeClass(input.classType), amount: Number(amountValue).toFixed(2), currency }
}

function normalizeCoach(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw clientError(400, 'VALIDATION_ERROR', 'Coach details are required.')
  }
  const classType = normalizeClass(input.classType)
  const coachNumber = requiredText(input.coachNumber, 'Coach number', 10, /^[A-Za-z0-9-]+$/).toUpperCase()
  if (!Array.isArray(input.seats) || input.seats.length < 1 || input.seats.length > 100) {
    throw clientError(400, 'VALIDATION_ERROR', 'A coach needs between 1 and 100 seats.')
  }
  const seats = input.seats.map((seat, index) => {
    if (!seat || typeof seat !== 'object' || Array.isArray(seat)) {
      throw clientError(400, 'VALIDATION_ERROR', `Seat ${index + 1} is invalid.`)
    }
    const seatNumber = requiredText(seat.seatNumber, `Seat ${index + 1} number`, 10, /^[A-Za-z0-9-]+$/).toUpperCase()
    const berthType = typeof seat.berthType === 'string' ? seat.berthType.toUpperCase() : 'NA'
    const status = typeof seat.status === 'string' ? seat.status.toUpperCase() : 'AVAILABLE'
    if (!BERTH_TYPES.has(berthType) || !SEAT_STATUSES.has(status)) {
      throw clientError(400, 'VALIDATION_ERROR', `Seat ${index + 1} berth type or status is invalid.`)
    }
    return { seatNumber, berthType, status }
  })
  if (new Set(seats.map((seat) => seat.seatNumber)).size !== seats.length) {
    throw clientError(400, 'VALIDATION_ERROR', 'Seat numbers must be unique within a coach.')
  }
  return { classType, coachNumber, seats }
}

function normalizeSeat(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw clientError(400, 'VALIDATION_ERROR', 'Seat details are required.')
  }
  const seatNumber = requiredText(input.seatNumber, 'Seat number', 10, /^[A-Za-z0-9-]+$/).toUpperCase()
  const berthType = typeof input.berthType === 'string' ? input.berthType.toUpperCase() : ''
  const status = typeof input.status === 'string' ? input.status.toUpperCase() : ''
  if (!BERTH_TYPES.has(berthType) || !SEAT_STATUSES.has(status)) {
    throw clientError(400, 'VALIDATION_ERROR', 'Seat berth type or status is invalid.')
  }
  return { seatNumber, berthType, status }
}

function translateDatabaseError(error) {
  if (error.statusCode) return error
  if (error.code === 'ER_DUP_ENTRY') {
    return clientError(409, 'DUPLICATE_MASTER_DATA', 'A train, schedule, coach, seat, or fare with those details already exists.')
  }
  if (error.code === 'ER_NO_REFERENCED_ROW_2') {
    return clientError(400, 'INVALID_REFERENCE', 'A referenced train, station, or schedule does not exist.')
  }
  if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    return clientError(409, 'MASTER_DATA_IN_USE', 'This master data is referenced and cannot be removed.')
  }
  return error
}

function createAdminManagementService(db, options = {}) {
  const database = db || require('../config/db')
  const repository = options.repository || createAdminManagementRepository(database)

  async function transaction(work) {
    const connection = await database.getConnection()
    let open = false
    try {
      await connection.beginTransaction()
      open = true
      const result = await work(connection)
      await connection.commit()
      open = false
      return result
    } catch (rawError) {
      if (open) await connection.rollback()
      throw translateDatabaseError(rawError)
    } finally {
      connection.release()
    }
  }

  async function assertRouteStations(connection, routeStops) {
    const stations = await repository.stationIdsByCode(connection, routeStops.map((stop) => stop.stationCode))
    const stationIds = new Map(stations.map((station) => [station.code, Number(station.stationId)]))
    if (stationIds.size !== routeStops.length) {
      const unknown = routeStops.map((stop) => stop.stationCode).filter((code) => !stationIds.has(code))
      throw clientError(400, 'INVALID_STATIONS', `Unknown station code${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.`)
    }
    return stationIds
  }

  async function audit(connection, actorUserId, action, entityType, entityId, details) {
    const actor = requiredId(actorUserId, 'Administrator user ID')
    await repository.audit(connection, { actorUserId: actor, action, entityType, entityId, details })
  }

  return {
    listStations: () => repository.listStations(),
    listTrains: () => repository.listTrains(),
    listSchedules: () => repository.listSchedules(),

    async createTrain(actorUserId, input) {
      const train = normalizeTrain(input, true)
      return transaction(async (connection) => {
        const stationIds = await assertRouteStations(connection, train.routeStops)
        const [result] = await repository.insertTrain(connection, train)
        await repository.replaceTrainRoute(connection, result.insertId, train.routeStops, stationIds)
        await audit(connection, actorUserId, 'ADMIN_TRAIN_CREATED', 'train', result.insertId, {
          trainNumber: train.trainNumber,
          routeStops: train.routeStops.map((stop) => stop.stationCode),
        })
        return { trainId: result.insertId, ...train }
      })
    },

    async updateTrain(actorUserId, trainIdValue, input) {
      const trainId = requiredId(trainIdValue, 'Train ID')
      const train = normalizeTrain(input, false)
      return transaction(async (connection) => {
        if (!await repository.getTrainForUpdate(connection, trainId)) {
          throw clientError(404, 'TRAIN_NOT_FOUND', 'Train not found.')
        }
        if (!train.active && await repository.countActiveTrainBookings(connection, trainId) > 0) {
          throw clientError(409, 'TRAIN_HAS_ACTIVE_BOOKINGS', 'A train with active bookings cannot be deactivated.')
        }
        if (train.routeStops) {
          if (await repository.countTrainSchedules(connection, trainId) > 0) {
            throw clientError(409, 'TRAIN_ROUTE_IN_USE', 'A train route with existing schedules cannot be changed.')
          }
          const stationIds = await assertRouteStations(connection, train.routeStops)
          await repository.replaceTrainRoute(connection, trainId, train.routeStops, stationIds)
        }
        await repository.updateTrain(connection, trainId, train)
        await audit(connection, actorUserId, train.active ? 'ADMIN_TRAIN_UPDATED' : 'ADMIN_TRAIN_DEACTIVATED', 'train', trainId, {
          trainNumber: train.trainNumber,
          active: train.active,
          routeUpdated: Boolean(train.routeStops),
        })
        return { trainId, ...train }
      })
    },

    async createSchedule(actorUserId, input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw clientError(400, 'VALIDATION_ERROR', 'Schedule details are required.')
      const trainId = requiredId(input.trainId, 'Train ID')
      const journeyDate = normalizeDate(input.journeyDate)
      return transaction(async (connection) => {
        const train = await repository.getTrain(connection, trainId)
        if (!train || !train.active) throw clientError(404, 'TRAIN_NOT_FOUND', 'Active train not found.')
        if (await repository.countTrainRouteStops(connection, trainId) < 2) {
          throw clientError(409, 'TRAIN_ROUTE_REQUIRED', 'Configure at least two route stops before scheduling this train.')
        }
        const [result] = await repository.insertSchedule(connection, { trainId, journeyDate })
        await audit(connection, actorUserId, 'ADMIN_SCHEDULE_CREATED', 'schedule', result.insertId, { trainId, journeyDate })
        return { scheduleId: result.insertId, trainId, journeyDate, status: 'SCHEDULED' }
      })
    },

    async updateSchedule(actorUserId, scheduleIdValue, input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw clientError(400, 'VALIDATION_ERROR', 'Schedule details are required.')
      const scheduleId = requiredId(scheduleIdValue, 'Schedule ID')
      const journeyDate = normalizeDate(input.journeyDate)
      const status = typeof input.status === 'string' ? input.status.toUpperCase() : ''
      if (!SCHEDULE_STATUSES.has(status)) throw clientError(400, 'VALIDATION_ERROR', 'Schedule status is invalid.')
      return transaction(async (connection) => {
        const current = await repository.getScheduleForUpdate(connection, scheduleId)
        if (!current) throw clientError(404, 'SCHEDULE_NOT_FOUND', 'Schedule not found.')
        if (String(current.journeyDate).slice(0, 10) !== journeyDate && await repository.countScheduleBookings(connection, scheduleId) > 0) {
          throw clientError(409, 'SCHEDULE_HAS_BOOKINGS', 'A schedule date with booking history cannot be changed.')
        }
        if (status === 'CANCELLED' && await repository.countScheduleBookings(connection, scheduleId, true) > 0) {
          throw clientError(409, 'SCHEDULE_HAS_ACTIVE_BOOKINGS', 'A schedule with active bookings cannot be deactivated.')
        }
        await repository.updateSchedule(connection, scheduleId, { journeyDate, status })
        await audit(connection, actorUserId, status === 'CANCELLED' ? 'ADMIN_SCHEDULE_DEACTIVATED' : 'ADMIN_SCHEDULE_UPDATED', 'schedule', scheduleId, { journeyDate, status })
        return { scheduleId, journeyDate, status }
      })
    },

    async listFares(scheduleIdValue) {
      return repository.listFares(requiredId(scheduleIdValue, 'Schedule ID'))
    },

    async saveFare(actorUserId, scheduleIdValue, input) {
      const scheduleId = requiredId(scheduleIdValue, 'Schedule ID')
      const fare = normalizeFare(input)
      return transaction(async (connection) => {
        if (!await repository.getScheduleForUpdate(connection, scheduleId)) throw clientError(404, 'SCHEDULE_NOT_FOUND', 'Schedule not found.')
        await repository.saveFare(connection, scheduleId, fare)
        await audit(connection, actorUserId, 'ADMIN_FARE_SAVED', 'fare', `${scheduleId}:${fare.classType}`, fare)
        return { scheduleId, ...fare }
      })
    },

    async listInventory(scheduleIdValue) {
      return repository.listInventory(requiredId(scheduleIdValue, 'Schedule ID'))
    },

    async addCoach(actorUserId, scheduleIdValue, input) {
      const scheduleId = requiredId(scheduleIdValue, 'Schedule ID')
      const coach = normalizeCoach(input)
      return transaction(async (connection) => {
        if (!await repository.getScheduleForUpdate(connection, scheduleId)) throw clientError(404, 'SCHEDULE_NOT_FOUND', 'Schedule not found.')
        const [result] = await repository.insertCoach(connection, scheduleId, coach)
        for (const seat of coach.seats) await repository.insertSeat(connection, result.insertId, seat)
        await audit(connection, actorUserId, 'ADMIN_INVENTORY_ADDED', 'coach', result.insertId, {
          scheduleId,
          classType: coach.classType,
          seatCount: coach.seats.length,
        })
        return { coachId: result.insertId, scheduleId, ...coach }
      })
    },

    async updateSeat(actorUserId, seatIdValue, input) {
      const seatId = requiredId(seatIdValue, 'Seat ID')
      const seat = normalizeSeat(input)
      return transaction(async (connection) => {
        const current = await repository.getSeatForUpdate(connection, seatId)
        if (!current) throw clientError(404, 'SEAT_NOT_FOUND', 'Seat not found.')
        if (await repository.countActiveSeatAllocations(connection, seatId) > 0) {
          throw clientError(409, 'SEAT_HAS_ACTIVE_BOOKING', 'A seat with an active booking cannot be changed.')
        }
        await repository.updateSeat(connection, seatId, seat)
        await audit(connection, actorUserId, 'ADMIN_SEAT_UPDATED', 'seat', seatId, {
          scheduleId: Number(current.scheduleId), ...seat,
        })
        return { seatId, ...seat }
      })
    },
  }
}

module.exports = { createAdminManagementService }
