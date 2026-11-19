/**
 * Seed a small, route-scoped set of explicitly simulated booking inventory.
 * Uses the imported route times and operating weekdays; it does not claim to
 * describe official railway fares, coach compositions, or seat availability.
 *
 * Dry run:
 *   npm run seed:imported-trains -- --source SBC --destination MYS --days 30
 * Apply:
 *   npm run seed:imported-trains -- --source SBC --destination MYS --days 30 --apply --confirm-simulated
 */
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { assertDevelopmentTarget, verifyDevelopmentConnection } = require('./developmentDatabase')
const {
  CLASSES,
  CURRENCY,
  SEATS_PER_COACH,
  buildSchedulePlan,
  dateString,
  normalizeRouteCandidates,
  parseSeedOptions,
  shiftDate,
  simulatedFare,
} = require('./bookingInventorySeed')

const INSERT_CHUNK_SIZE = 250
const REQUIRED_TABLES = [
  'stations', 'trains', 'route_stops', 'train_running_days', 'schedules',
  'fares', 'coaches', 'seats', 'bookings', 'booking_seats',
]
const REQUIRED_FOREIGN_KEYS = [
  ['schedules', 'fk_schedule_train'],
  ['coaches', 'fk_coach_schedule'],
  ['fares', 'fk_fare_schedule'],
  ['seats', 'fk_seat_coach'],
]

function chunks(values, size = INSERT_CHUNK_SIZE) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function addInsertRows(connection, sql, rows) {
  return chunks(rows).reduce(async (pending, batch) => {
    const insertedSoFar = await pending
    const [result] = await connection.query(sql, [batch])
    return insertedSoFar + Number(result.affectedRows || 0)
  }, Promise.resolve(0))
}

async function assertSchemaReady(connection) {
  const placeholders = REQUIRED_TABLES.map(() => '?').join(', ')
  const [tables] = await connection.execute(
    `SELECT table_name AS tableName, engine AS engine
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`,
    REQUIRED_TABLES,
  )
  const found = new Map(tables.map(table => [table.tableName, table.engine]))
  const missing = REQUIRED_TABLES.filter(table => !found.has(table))
  const nonTransactional = REQUIRED_TABLES.filter(table => found.has(table) && found.get(table) !== 'InnoDB')
  if (missing.length) throw new Error(`Required schema tables are missing: ${missing.join(', ')}. Apply migrations first.`)
  if (nonTransactional.length) throw new Error(`Seed requires InnoDB tables: ${nonTransactional.join(', ')}.`)

  const [foreignKeys] = await connection.execute(
    `SELECT table_name AS tableName, constraint_name AS constraintName
     FROM information_schema.referential_constraints WHERE constraint_schema = DATABASE()`,
  )
  const foreignKeyNames = new Set(foreignKeys.map(key => `${key.tableName}:${key.constraintName}`))
  const missingForeignKeys = REQUIRED_FOREIGN_KEYS.filter(([table, name]) => !foreignKeyNames.has(`${table}:${name}`))
  if (missingForeignKeys.length) {
    throw new Error(`Required schedule/inventory foreign keys are missing: ${missingForeignKeys.map(([, name]) => name).join(', ')}.`)
  }
}

async function readRouteCandidates(connection, source, destination) {
  const [rows] = await connection.execute(
    `SELECT t.train_id AS trainId, t.train_number AS trainNumber,
            source_stop.day_offset AS sourceDayOffset,
            source_stop.departure_time AS departureTime,
            destination_stop.day_offset AS destinationDayOffset,
            destination_stop.arrival_time AS arrivalTime,
            running_day.weekday AS weekday
     FROM trains t
     JOIN route_stops source_stop ON source_stop.train_id = t.train_id
     JOIN stations source_station ON source_station.station_id = source_stop.station_id
     JOIN route_stops destination_stop
       ON destination_stop.train_id = t.train_id
      AND destination_stop.sequence_no > source_stop.sequence_no
     JOIN stations destination_station ON destination_station.station_id = destination_stop.station_id
     JOIN train_running_days running_day ON running_day.train_id = t.train_id
     WHERE t.active = TRUE
       AND source_station.code = ?
       AND destination_station.code = ?
       AND source_stop.departure_time IS NOT NULL
       AND destination_stop.arrival_time IS NOT NULL
     ORDER BY t.train_number, running_day.weekday`,
    [source, destination],
  )
  return normalizeRouteCandidates(rows)
}

async function readCandidateSchedules(connection, plan) {
  if (!plan.length) return []
  const trainIds = [...new Set(plan.map(item => item.trainId))]
  const dates = plan.map(item => item.journeyDate).sort()
  const placeholders = trainIds.map(() => '?').join(', ')
  const [rows] = await connection.execute(
    `SELECT schedule_id AS scheduleId, train_id AS trainId,
            DATE_FORMAT(journey_date, '%Y-%m-%d') AS journeyDate, status
     FROM schedules
     WHERE train_id IN (${placeholders}) AND journey_date BETWEEN ? AND ?`,
    [...trainIds, dates[0], dates.at(-1)],
  )
  const plannedKeys = new Set(plan.map(item => `${item.trainId}:${item.journeyDate}`))
  return rows.filter(row => plannedKeys.has(`${row.trainId}:${row.journeyDate}`))
}

async function readScheduleState(connection, schedules) {
  if (!schedules.length) return []
  const states = []
  for (const batch of chunks(schedules)) {
    const ids = batch.map(row => row.scheduleId)
    const placeholders = ids.map(() => '?').join(', ')
    const [rows] = await connection.execute(
      `SELECT sc.schedule_id AS scheduleId, sc.status,
              (SELECT COUNT(*) FROM bookings b WHERE b.schedule_id = sc.schedule_id) AS bookingCount,
              (SELECT COUNT(*) FROM coaches c WHERE c.schedule_id = sc.schedule_id) AS coachCount,
              (SELECT COUNT(*) FROM fares f WHERE f.schedule_id = sc.schedule_id) AS fareCount,
              (SELECT COUNT(*) FROM seats s JOIN coaches c ON c.coach_id = s.coach_id
               WHERE c.schedule_id = sc.schedule_id) AS seatCount
       FROM schedules sc WHERE sc.schedule_id IN (${placeholders})`,
      ids,
    )
    states.push(...rows.map(row => ({
      ...row,
      bookingCount: Number(row.bookingCount),
      coachCount: Number(row.coachCount),
      fareCount: Number(row.fareCount),
      seatCount: Number(row.seatCount),
    })))
  }
  return states
}

async function seedBookingInventory({ apply = false, argv = process.argv.slice(2), now = new Date() } = {}) {
  const options = parseSeedOptions(argv, now)
  assertDevelopmentTarget()

  const pool = require('../src/config/db')
  const connection = await pool.getConnection()
  let transactionOpen = false

  try {
    const identity = await verifyDevelopmentConnection(connection)
    await assertSchemaReady(connection)
    const { routes, invalidTrainCount } = await readRouteCandidates(
      connection,
      options.source,
      options.destination,
    )
    const plan = buildSchedulePlan(routes, options.startDate, options.days)
    const candidateSchedules = await readCandidateSchedules(connection, plan)
    const existingByKey = new Map(candidateSchedules.map(row => [`${row.trainId}:${row.journeyDate}`, row]))
    const plannedWithExisting = plan.map(item => ({ ...item, existing: existingByKey.get(`${item.trainId}:${item.journeyDate}`) || null }))

    const startEndDate = shiftDate(options.startDate, options.days - 1)
    const summary = {
      mode: options.apply ? 'APPLY' : 'DRY_RUN',
      database: identity.databaseName,
      mysqlVersion: identity.version,
      route: { source: options.source, destination: options.destination },
      requestedJourneyDateRange: { start: options.startDate, end: startEndDate },
      eligibleRouteTrains: routes.length,
      excludedInvalidRouteTrains: invalidTrainCount,
      operatingDayRulesApplied: true,
      plannedSchedules: plan.length,
      existingSchedules: candidateSchedules.length,
      newSchedulesPlanned: plan.length - candidateSchedules.length,
      classesPerNewSchedule: CLASSES.length,
      coachesPerClass: 1,
      seatsPerCoach: SEATS_PER_COACH,
      faresAreSimulatedProjectValues: true,
      officialRailwayAvailabilityClaimed: false,
    }

    if (!options.apply) {
      const states = await readScheduleState(connection, candidateSchedules)
      summary.existingSchedulesWithBookings = states.filter(row => row.bookingCount > 0).length
      summary.existingSchedulesWithInventory = states.filter(row => row.coachCount + row.fareCount + row.seatCount > 0).length
      console.log(JSON.stringify(summary, null, 2))
      return summary
    }

    await connection.beginTransaction()
    transactionOpen = true
    const scheduleRows = plan.map(item => [item.trainId, item.journeyDate, 'SCHEDULED'])
    summary.schedulesInserted = await addInsertRows(
      connection,
      `INSERT IGNORE INTO schedules (train_id, journey_date, status) VALUES ?`,
      scheduleRows,
    )

    const schedules = await readCandidateSchedules(connection, plan)
    const stateById = new Map((await readScheduleState(connection, schedules)).map(row => [String(row.scheduleId), row]))
    const planByKey = new Map(plan.map(item => [`${item.trainId}:${item.journeyDate}`, item]))
    const seedableSchedules = []
    let skippedBooked = 0
    let skippedExistingInventory = 0
    let skippedNonScheduled = 0

    for (const schedule of schedules) {
      const state = stateById.get(String(schedule.scheduleId))
      if (!state || schedule.status !== 'SCHEDULED') {
        skippedNonScheduled += 1
      } else if (state.bookingCount > 0) {
        skippedBooked += 1
      } else if (state.coachCount + state.fareCount + state.seatCount > 0) {
        skippedExistingInventory += 1
      } else {
        const planned = planByKey.get(`${schedule.trainId}:${schedule.journeyDate}`)
        if (planned) seedableSchedules.push({ ...schedule, plan: planned })
      }
    }

    const coachRows = []
    const fareRows = []
    for (const schedule of seedableSchedules) {
      for (const classConfig of CLASSES) {
        coachRows.push([schedule.scheduleId, classConfig.classType, classConfig.coachNumber])
        fareRows.push([
          schedule.scheduleId,
          classConfig.classType,
          simulatedFare(schedule.plan.durationMinutes, classConfig.fareMultiplier).toFixed(2),
          CURRENCY,
        ])
      }
    }

    summary.coachesInserted = await addInsertRows(
      connection,
      `INSERT IGNORE INTO coaches (schedule_id, class_type, coach_number) VALUES ?`,
      coachRows,
    )
    summary.faresInserted = await addInsertRows(
      connection,
      `INSERT IGNORE INTO fares (schedule_id, class_type, amount, currency) VALUES ?`,
      fareRows,
    )

    const coachIds = []
    for (const batch of chunks(seedableSchedules)) {
      const ids = batch.map(item => item.scheduleId)
      const schedulePlaceholders = ids.map(() => '?').join(', ')
      const classPlaceholders = CLASSES.map(() => '?').join(', ')
      const [rows] = await connection.execute(
        `SELECT coach_id AS coachId, schedule_id AS scheduleId, class_type AS classType
         FROM coaches WHERE schedule_id IN (${schedulePlaceholders})
           AND class_type IN (${classPlaceholders})`,
        [...ids, ...CLASSES.map(item => item.classType)],
      )
      coachIds.push(...rows)
    }

    const classByType = new Map(CLASSES.map(item => [item.classType, item]))
    const seatRows = []
    for (const coach of coachIds) {
      const config = classByType.get(coach.classType)
      for (let seatNumber = 1; seatNumber <= SEATS_PER_COACH; seatNumber += 1) {
        seatRows.push([
          coach.coachId,
          String(seatNumber).padStart(2, '0'),
          config.berthTypes[(seatNumber - 1) % config.berthTypes.length],
          'AVAILABLE',
        ])
      }
    }
    summary.seatsInserted = await addInsertRows(
      connection,
      `INSERT IGNORE INTO seats (coach_id, seat_number, berth_type, status) VALUES ?`,
      seatRows,
    )

    if (seedableSchedules.length) {
      const ids = seedableSchedules.map(item => item.scheduleId)
      const placeholders = ids.map(() => '?').join(', ')
      const [verification] = await connection.execute(
        `SELECT sc.schedule_id AS scheduleId,
                COUNT(DISTINCT c.class_type) AS classCount,
                COUNT(DISTINCT f.class_type) AS fareClassCount,
                COUNT(DISTINCT s.seat_id) AS seatCount,
                COUNT(DISTINCT CASE WHEN s.status = 'AVAILABLE' THEN s.seat_id END) AS availableSeatCount
         FROM schedules sc
         LEFT JOIN coaches c ON c.schedule_id = sc.schedule_id
         LEFT JOIN fares f ON f.schedule_id = sc.schedule_id AND f.class_type = c.class_type
         LEFT JOIN seats s ON s.coach_id = c.coach_id
         WHERE sc.schedule_id IN (${placeholders})
         GROUP BY sc.schedule_id`,
        ids,
      )
      const incomplete = verification.filter(row =>
        Number(row.classCount) !== CLASSES.length ||
        Number(row.fareClassCount) !== CLASSES.length ||
        Number(row.seatCount) !== CLASSES.length * SEATS_PER_COACH ||
        Number(row.availableSeatCount) !== CLASSES.length * SEATS_PER_COACH,
      )
      if (incomplete.length !== 0 || verification.length !== seedableSchedules.length) {
        throw new Error(`Post-insert inventory verification failed for ${incomplete.length || seedableSchedules.length - verification.length} schedule(s); transaction rolled back.`)
      }
    }

    await connection.commit()
    transactionOpen = false
    summary.inventoryConfiguredSchedules = seedableSchedules.length
    summary.skippedSchedulesWithBookings = skippedBooked
    summary.skippedSchedulesWithExistingInventory = skippedExistingInventory
    summary.skippedSchedulesNotScheduled = skippedNonScheduled
    summary.configuredClasses = seedableSchedules.length * CLASSES.length
    summary.configuredFares = summary.faresInserted
    summary.configuredCoaches = summary.coachesInserted
    summary.configuredSeats = summary.seatsInserted
    summary.simulatedFareFormula = 'Duration-based illustrative INR values; not official railway fares.'
    console.log(JSON.stringify(summary, null, 2))
    return summary
  } finally {
    if (transactionOpen) await connection.rollback()
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  seedBookingInventory().catch(error => {
    console.error('Booking inventory seed failed:', error.message)
    process.exitCode = 1
  })
}

module.exports = { assertSchemaReady, readCandidateSchedules, readRouteCandidates, seedBookingInventory }
