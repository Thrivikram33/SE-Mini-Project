const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Module = require('node:module')
const mysql = require('mysql2/promise')

const REQUIRED_ENV = [
  'RRS_MYSQL_TEST_HOST',
  'RRS_MYSQL_TEST_USER',
  'RRS_MYSQL_TEST_PASSWORD',
]
const missing = REQUIRED_ENV.filter((name) => !process.env[name])
if (missing.length) {
  throw new Error(`MySQL integration tests require explicit test-only configuration: ${missing.join(', ')}`)
}
if (process.env.RRS_MYSQL_TEST_DATABASE !== 'railway_reservation_issue10_test') {
  throw new Error('MySQL integration tests require RRS_MYSQL_TEST_DATABASE=railway_reservation_issue10_test; refusing any other database.')
}
if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.RRS_MYSQL_TEST_HOST.toLowerCase())) {
  throw new Error('MySQL integration tests only allow a local test server; refusing a remote host.')
}

const pool = mysql.createPool({
  host: process.env.RRS_MYSQL_TEST_HOST,
  port: Number(process.env.RRS_MYSQL_TEST_PORT) || 3306,
  user: process.env.RRS_MYSQL_TEST_USER,
  password: process.env.RRS_MYSQL_TEST_PASSWORD,
  database: process.env.RRS_MYSQL_TEST_DATABASE,
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 5000,
})

const servicePath = path.resolve(__dirname, '../src/services/trainSearchService.js')
const seatServicePath = path.resolve(__dirname, '../src/services/seatSelectionService.js')
const bookingServicePath = path.resolve(__dirname, '../src/services/bookingService.js')
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent && [servicePath, seatServicePath, bookingServicePath].includes(parent.filename) && request === '../config/db') return pool
  return originalLoad.call(this, request, parent, isMain)
}
let searchTrains
let getSeatsForClass
let createBookingService
try {
  ;({ searchTrains } = require(servicePath))
  ;({ getSeatsForClass } = require(seatServicePath))
  ;({ createBookingService } = require(bookingServicePath))
} finally {
  Module._load = originalLoad
}
const { createAdminManagementService } = require('../src/services/adminManagementService')

const fixture = {
  token: crypto.randomBytes(4).toString('hex').toUpperCase(),
  created: {},
  bookingSeats: {},
  seatIds: {},
  bookingIds: {},
  passengerIds: {},
}
const expectedTables = [
  'audit_logs', 'booking_seats', 'bookings', 'cancellations', 'coaches', 'fares', 'payments',
  'passengers', 'route_stops', 'schedules', 'seats', 'stations', 'trains', 'users',
]

async function applySchemaToDedicatedTestDatabase() {
  const [[server]] = await pool.query('SELECT DATABASE() AS databaseName, @@hostname AS hostname, @@port AS port')
  assert.equal(server.databaseName, 'railway_reservation_issue10_test')
  assert.ok(server.hostname, 'MySQL server identity must be available')
  assert.equal(Number(server.port), Number(process.env.RRS_MYSQL_TEST_PORT || 3306))

  const migrationPath = path.resolve(__dirname, '../../database/migrations/001_initial_schema.sql')
  const migration = fs.readFileSync(migrationPath, 'utf8')
  assert.match(migration, /^USE\s+railway_reservation\s*;/im)
  const testDatabaseMigration = migration
    .replace(/^USE\s+railway_reservation\s*;\s*/im, '')
    .replace(/^\s*--.*$/gm, '')
  assert.doesNotMatch(testDatabaseMigration, /^\s*(USE|DROP|TRUNCATE)\b/im)

  const createStatements = testDatabaseMigration
    .split(';')
    .map((sql) => sql.trim())
    .filter((sql) => /^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(sql))
  assert.equal(createStatements.length, 14, 'unexpected initial schema migration shape')
  const [existingTables] = await pool.query(
    `SELECT TABLE_NAME AS tableName, ENGINE AS engine
     FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY TABLE_NAME`,
  )
  const existingNames = existingTables.map((table) => table.tableName).sort()
  if (existingNames.length && JSON.stringify(existingNames) !== JSON.stringify(expectedTables)) {
    throw new Error('The isolated Issue #10 database contains an unexpected or partial table set; refusing schema changes.')
  }
  if (!existingNames.length) {
    for (const statement of createStatements) await pool.query(statement)
  } else if (existingTables.some((table) => table.engine !== 'InnoDB')) {
    throw new Error('The isolated Issue #10 database contains a non-InnoDB table; refusing integration tests.')
  }

  const pendingCounts = await Promise.all(expectedTables.map(async (table) => {
    const [[row]] = await pool.query(`SELECT COUNT(*) AS count FROM \`${table}\``)
    return { table, count: Number(row.count) }
  }))
  const populatedTables = pendingCounts.filter(({ count }) => count > 0)
  if (populatedTables.length) {
    throw new Error(`The isolated Issue #10 database is not empty (${populatedTables.map(({ table }) => table).join(', ')}); inspect it before running tests.`)
  }
  const pnrMigrationPath = path.resolve(__dirname, '../../database/migrations/002_allow_pnr_for_failed_bookings.sql')
  const pnrMigration = fs.readFileSync(pnrMigrationPath, 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((sql) => sql.trim())
    .filter(Boolean)
  assert.equal(pnrMigration.length, 1, 'unexpected PNR migration shape')
  assert.match(pnrMigration[0], /^ALTER\s+TABLE\s+bookings\s+MODIFY\s+COLUMN\s+pnr\s+CHAR\(12\)\s+NULL$/i)
  const [[pnrColumn]] = await pool.query(
    `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'bookings' AND column_name = 'pnr'`,
  )
  assert.ok(pnrColumn && /^char\(12\)$/i.test(pnrColumn.columnType), 'PNR column must match the migration type')
  if (pnrColumn.nullable !== 'YES') await pool.query(pnrMigration[0])

  const allocationMigrationPath = path.resolve(__dirname, '../../database/migrations/003_enforce_booking_passenger_pair.sql')
  const allocationMigration = fs.readFileSync(allocationMigrationPath, 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((sql) => sql.trim())
    .filter(Boolean)
  assert.equal(allocationMigration.length, 2, 'unexpected allocation-integrity migration shape')
  assert.match(allocationMigration[0], /^ALTER\s+TABLE\s+passengers\s+ADD\s+UNIQUE\s+KEY\s+uq_passenger_booking_pair/i)
  assert.match(allocationMigration[1], /^ALTER\s+TABLE\s+booking_seats\s+ADD\s+CONSTRAINT\s+fk_booking_seat_booking_passenger/i)
  const [[{ passengerPairIndex }]] = await pool.query(
    `SELECT COUNT(DISTINCT index_name) AS passengerPairIndex FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = 'passengers'
       AND index_name = 'uq_passenger_booking_pair'`,
  )
  const [[{ allocationPassengerForeignKey }]] = await pool.query(
    `SELECT COUNT(*) AS allocationPassengerForeignKey FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE() AND table_name = 'booking_seats'
       AND constraint_name = 'fk_booking_seat_booking_passenger'`,
  )
  const integrityMigrationObjects = Number(passengerPairIndex) + Number(allocationPassengerForeignKey)
  if (integrityMigrationObjects === 0) {
    for (const statement of allocationMigration) await pool.query(statement)
  } else if (integrityMigrationObjects !== 2) {
    throw new Error('The isolated test database has a partial Issue #10 integrity migration; refusing to guess its state.')
  }

  // Apply migration 004: booking journey details.
  const journeyMigrationPath = path.resolve(
    __dirname,
    '../../database/migrations/004_booking_journey_details.sql',
  )
  const journeyMigration = fs.readFileSync(journeyMigrationPath, 'utf8')
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((sql) => sql.trim())
    .filter(Boolean)

  assert.equal(journeyMigration.length, 1, 'unexpected booking journey migration shape')
  assert.match(
    journeyMigration[0],
    /^ALTER\s+TABLE\s+bookings/i,
    'booking journey migration must alter only the bookings table',
  )

  const [[journeyColumns]] = await pool.query(
    `SELECT
       SUM(column_name = 'origin_station_id') AS originColumn,
       SUM(column_name = 'destination_station_id') AS destinationColumn,
       SUM(column_name = 'class_type') AS classColumn
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'bookings'`,
  )

  const [[journeyConstraints]] = await pool.query(
    `SELECT COUNT(*) AS constraintCount
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = 'bookings'
       AND constraint_name IN (
         'fk_booking_origin_station',
         'fk_booking_destination_station'
       )`,
  )

  const journeyObjects =
    Number(journeyColumns.originColumn) +
    Number(journeyColumns.destinationColumn) +
    Number(journeyColumns.classColumn) +
    Number(journeyConstraints.constraintCount)

  if (journeyObjects === 0) {
    await pool.query(journeyMigration[0])
  } else if (journeyObjects !== 5) {
    throw new Error(
      'The isolated test database has a partial booking journey migration; refusing to guess its state.',
    )
  }
}

async function insertFixture() {
  const token = fixture.token
  const [user] = await pool.execute(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES (?, ?, ?, 'PASSENGER')`,
    ['Issue 4 integration fixture', `issue4-${token}@example.invalid`, 'test-only-hash'],
  )
  fixture.created.userId = user.insertId

  const [source] = await pool.execute(
    'INSERT INTO stations (code, name, city) VALUES (?, ?, ?)',
    [`I4${token.slice(0, 4)}A`, `Issue4 Source ${token}`, 'Integration Test'],
  )
  fixture.created.sourceId = source.insertId
  const [destination] = await pool.execute(
    'INSERT INTO stations (code, name, city) VALUES (?, ?, ?)',
    [`I4${token.slice(0, 4)}B`, `Issue4 Destination ${token}`, 'Integration Test'],
  )
  fixture.created.destinationId = destination.insertId

  const [train] = await pool.execute(
    'INSERT INTO trains (train_number, train_name, active) VALUES (?, ?, TRUE)',
    [`I4${token.slice(0, 8)}`, `Issue 4 ${token}`],
  )
  fixture.created.trainId = train.insertId
  await pool.execute(
    `INSERT INTO route_stops
       (train_id, station_id, sequence_no, departure_time, arrival_time, day_offset)
     VALUES (?, ?, 1, '09:00:00', NULL, 0), (?, ?, 2, NULL, '10:00:00', 0)`,
    [train.insertId, source.insertId, train.insertId, destination.insertId],
  )

  const future = new Date()
  future.setUTCDate(future.getUTCDate() + 30)
  const date = future.toISOString().slice(0, 10)
  const [schedule] = await pool.execute(
    'INSERT INTO schedules (train_id, journey_date, status) VALUES (?, ?, \'SCHEDULED\')',
    [train.insertId, date],
  )
  fixture.created.scheduleId = schedule.insertId
  fixture.created.date = date

  const [coach] = await pool.execute(
    `INSERT INTO coaches (schedule_id, class_type, coach_number)
     VALUES (?, 'SL', 'I4TEST')`,
    [schedule.insertId],
  )
  fixture.created.coachId = coach.insertId
  await pool.execute(
    `INSERT INTO fares (schedule_id, class_type, amount, currency)
     VALUES (?, 'SL', 100.00, 'INR')`,
    [schedule.insertId],
  )

  const states = [
    { name: 'available', seatStatus: 'AVAILABLE' },
    { name: 'blocked', seatStatus: 'BLOCKED' },
    { name: 'held_pending', seatStatus: 'AVAILABLE', bookingStatus: 'PENDING_PAYMENT', allocationStatus: 'HELD' },
    { name: 'confirmed', seatStatus: 'AVAILABLE', bookingStatus: 'CONFIRMED', allocationStatus: 'CONFIRMED' },
    { name: 'released', seatStatus: 'AVAILABLE', bookingStatus: 'PAYMENT_FAILED', allocationStatus: 'RELEASED' },
    { name: 'held_failed', seatStatus: 'AVAILABLE', bookingStatus: 'PAYMENT_FAILED', allocationStatus: 'HELD' },
    { name: 'confirmed_cancelled', seatStatus: 'AVAILABLE', bookingStatus: 'CANCELLED', allocationStatus: 'CONFIRMED' },
  ]

  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]
    const [seat] = await pool.execute(
      `INSERT INTO seats (coach_id, seat_number, berth_type, status)
       VALUES (?, ?, 'NA', ?)`,
      [coach.insertId, String(index + 1).padStart(2, '0'), state.seatStatus],
    )
    fixture.seatIds[state.name] = seat.insertId

    if (!state.bookingStatus) continue
    const [booking] = await pool.execute(
      `INSERT INTO bookings (pnr, user_id, schedule_id, status, total_fare)
       VALUES (?, ?, ?, ?, 100.00)`,
      [`I4${token}${index}`, user.insertId, schedule.insertId, state.bookingStatus],
    )
    fixture.bookingIds[state.name] = booking.insertId
    const [passenger] = await pool.execute(
      `INSERT INTO passengers (booking_id, name, age, gender)
       VALUES (?, 'Issue 4 Fixture', 30, 'UNDISCLOSED')`,
      [booking.insertId],
    )
    fixture.passengerIds[state.name] = passenger.insertId
    const [allocation] = await pool.execute(
      `INSERT INTO booking_seats
         (booking_id, seat_id, passenger_id, allocation_status, released_at)
       VALUES (?, ?, ?, ?, CASE WHEN ? = 'RELEASED' THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [booking.insertId, seat.insertId, passenger.insertId, state.allocationStatus, state.allocationStatus],
    )
    fixture.bookingSeats[state.name] = allocation.insertId
  }

  fixture.created.sourceCode = `I4${token.slice(0, 4)}A`
  fixture.created.destinationCode = `I4${token.slice(0, 4)}B`
}

async function cleanupFixture() {
  const ids = fixture.created
  // Delete only records inserted by this test, in FK dependency order.
  if (ids.adminUserId) {
    await pool.execute('DELETE FROM audit_logs WHERE actor_user_id = ?', [ids.adminUserId])
  }
  const bookingIds = Object.values(fixture.bookingIds)
  if (bookingIds.length) {
    const placeholders = bookingIds.map(() => '?').join(', ')
    if (ids.userId) {
      await pool.execute(
        `DELETE FROM audit_logs
         WHERE actor_user_id = ? AND entity_type = 'booking' AND entity_id IN (${placeholders})`,
        [ids.userId, ...bookingIds.map(String)],
      )
    }
    await pool.execute(`DELETE FROM cancellations WHERE booking_id IN (${placeholders})`, bookingIds)
    await pool.execute(`DELETE FROM payments WHERE booking_id IN (${placeholders})`, bookingIds)
    await pool.execute(`DELETE FROM booking_seats WHERE booking_id IN (${placeholders})`, bookingIds)
    await pool.execute(`DELETE FROM passengers WHERE booking_id IN (${placeholders})`, bookingIds)
    await pool.execute(`DELETE FROM bookings WHERE booking_id IN (${placeholders})`, bookingIds)
  }
  if (ids.coachId) await pool.execute('DELETE FROM seats WHERE coach_id = ?', [ids.coachId])
  if (ids.scheduleId) await pool.execute('DELETE FROM fares WHERE schedule_id = ?', [ids.scheduleId])
  if (ids.coachId) await pool.execute('DELETE FROM coaches WHERE coach_id = ?', [ids.coachId])
  if (ids.scheduleId) await pool.execute('DELETE FROM schedules WHERE schedule_id = ?', [ids.scheduleId])
  if (ids.adminScheduleId) await pool.execute('DELETE FROM schedules WHERE schedule_id = ?', [ids.adminScheduleId])
  if (ids.trainId) await pool.execute('DELETE FROM route_stops WHERE train_id = ?', [ids.trainId])
  if (ids.trainId) await pool.execute('DELETE FROM trains WHERE train_id = ?', [ids.trainId])
  if (ids.adminTrainId) await pool.execute('DELETE FROM route_stops WHERE train_id = ?', [ids.adminTrainId])
  if (ids.adminTrainId) await pool.execute('DELETE FROM trains WHERE train_id = ?', [ids.adminTrainId])
  if (ids.sourceId) await pool.execute('DELETE FROM stations WHERE station_id = ?', [ids.sourceId])
  if (ids.destinationId) await pool.execute('DELETE FROM stations WHERE station_id = ?', [ids.destinationId])
  if (ids.userId) await pool.execute('DELETE FROM users WHERE user_id = ?', [ids.userId])
  if (ids.adminUserId) await pool.execute('DELETE FROM users WHERE user_id = ?', [ids.adminUserId])
}

async function getAvailability() {
  const [result] = await searchTrains({
    source: fixture.created.sourceCode,
    destination: fixture.created.destinationCode,
    date: fixture.created.date,
  })
  assert.ok(result, 'the fixture schedule should match the real search query')
  return Number(result.availableSeats)
}

function withTimeout(promise, label) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded the 10 second timeout`)), 10000)
    }),
  ]).finally(() => clearTimeout(timer))
}

test('real MySQL inventory and unique active-seat constraint remain consistent', async () => {
  try {
    await applySchemaToDedicatedTestDatabase()
    await insertFixture()

    await assert.rejects(
      pool.execute(
        `INSERT INTO booking_seats (booking_id, seat_id, passenger_id, allocation_status)
         VALUES (?, ?, ?, 'HELD')`,
        [fixture.bookingIds.held_pending, fixture.seatIds.available, fixture.passengerIds.confirmed],
      ),
      (error) => error.code === 'ER_NO_REFERENCED_ROW_2',
      'allocation must not associate a booking with another booking’s passenger',
    )

    const expectedInitially = ['available', 'released'].length
    assert.equal(await getAvailability(), expectedInitially)

    const [seats] = await pool.execute(
      `SELECT seat_id AS seatId, seat_number AS seatNumber
       FROM seats WHERE coach_id = ? ORDER BY seat_number`,
      [fixture.created.coachId],
    )
    const actualById = new Map(seats.map((seat) => [String(seat.seatId), Number(seat.seatId)]))
    assert.equal(actualById.size, 7)
    const classSeats = await getSeatsForClass(fixture.created.scheduleId, 'SL')
    const seatAvailability = new Map(classSeats.map((seat) => [String(seat.seatId), seat.available]))
    assert.equal(seatAvailability.get(String(fixture.seatIds.held_failed)), false)
    assert.equal(seatAvailability.get(String(fixture.seatIds.confirmed_cancelled)), false)
    assert.equal(seatAvailability.get(String(fixture.seatIds.released)), true)

    const failedAndCancelledAllocations = [
      fixture.bookingSeats.held_failed,
      fixture.bookingSeats.confirmed_cancelled,
    ]
    const allocationPlaceholders = failedAndCancelledAllocations.map(() => '?').join(', ')
    await pool.execute(
      `UPDATE booking_seats
       SET allocation_status = 'RELEASED', released_at = CURRENT_TIMESTAMP
       WHERE booking_seat_id IN (${allocationPlaceholders})`,
      failedAndCancelledAllocations,
    )
    assert.equal(await getAvailability(), expectedInitially + failedAndCancelledAllocations.length)

    await pool.execute("UPDATE seats SET status = 'BLOCKED' WHERE coach_id = ?", [fixture.created.coachId])
    assert.equal(await getAvailability(), 0)
    await pool.execute(
      "UPDATE seats SET status = 'AVAILABLE' WHERE coach_id = ? AND seat_id <> ?",
      [fixture.created.coachId, fixture.seatIds.blocked],
    )

    const seatId = fixture.seatIds.available
    const [bookingA] = await pool.execute(
      `INSERT INTO bookings (pnr, user_id, schedule_id, status, total_fare)
       VALUES (?, ?, ?, 'PENDING_PAYMENT', 100.00)`,
      [`I4${fixture.token}CA`, fixture.created.userId, fixture.created.scheduleId],
    )
    fixture.bookingIds.concurrentA = bookingA.insertId
    const [passengerA] = await pool.execute(
      `INSERT INTO passengers (booking_id, name, age, gender)
       VALUES (?, 'Concurrent A', 30, 'UNDISCLOSED')`,
      [bookingA.insertId],
    )
    const [bookingB] = await pool.execute(
      `INSERT INTO bookings (pnr, user_id, schedule_id, status, total_fare)
       VALUES (?, ?, ?, 'PENDING_PAYMENT', 100.00)`,
      [`I4${fixture.token}CB`, fixture.created.userId, fixture.created.scheduleId],
    )
    fixture.bookingIds.concurrentB = bookingB.insertId
    const [passengerB] = await pool.execute(
      `INSERT INTO passengers (booking_id, name, age, gender)
       VALUES (?, 'Concurrent B', 30, 'UNDISCLOSED')`,
      [bookingB.insertId],
    )

    const connectionA = await pool.getConnection()
    const connectionB = await pool.getConnection()
    try {
      await connectionA.beginTransaction()
      await connectionB.beginTransaction()
      const [activeA] = await connectionA.execute(
        `INSERT INTO booking_seats (booking_id, seat_id, passenger_id, allocation_status)
         VALUES (?, ?, ?, 'HELD')`,
        [bookingA.insertId, seatId, passengerA.insertId],
      )
      fixture.bookingSeats.concurrentA = activeA.insertId

      // Submit the competing insert on an independent connection before releasing A's unique-key lock.
      const competingInsert = connectionB.execute(
        `INSERT INTO booking_seats (booking_id, seat_id, passenger_id, allocation_status)
         VALUES (?, ?, ?, 'HELD')`,
        [bookingB.insertId, seatId, passengerB.insertId],
      ).then(() => ({ succeeded: true }), (error) => ({ succeeded: false, code: error.code }))
      assert.equal(await getAvailability(), expectedInitially + failedAndCancelledAllocations.length)
      await withTimeout(connectionA.commit(), 'first allocation commit')
      const competing = await withTimeout(competingInsert, 'competing allocation')
      assert.deepEqual(competing, { succeeded: false, code: 'ER_DUP_ENTRY' })
      await connectionB.rollback()
      assert.equal(await getAvailability(), expectedInitially + failedAndCancelledAllocations.length - 1)

      await connectionA.beginTransaction()
      await connectionA.execute(
        `UPDATE booking_seats SET allocation_status = 'RELEASED', released_at = CURRENT_TIMESTAMP
         WHERE booking_id = ? AND seat_id = ?`,
        [bookingA.insertId, seatId],
      )
      assert.equal(await getAvailability(), expectedInitially + failedAndCancelledAllocations.length - 1)

      await connectionB.beginTransaction()
      const reallocationAfterRelease = connectionB.execute(
        `INSERT INTO booking_seats (booking_id, seat_id, passenger_id, allocation_status)
         VALUES (?, ?, ?, 'HELD')`,
        [bookingB.insertId, seatId, passengerB.insertId],
      ).then(() => ({ succeeded: true }), (error) => ({ succeeded: false, code: error.code }))
      assert.equal(await getAvailability(), expectedInitially + failedAndCancelledAllocations.length - 1)
      await connectionA.commit()
      assert.deepEqual(await withTimeout(reallocationAfterRelease, 'release and reallocation'), { succeeded: true })
      assert.equal(await getAvailability(), expectedInitially + failedAndCancelledAllocations.length)
      await connectionB.commit()
      assert.equal(await getAvailability(), expectedInitially + failedAndCancelledAllocations.length - 1)

      // Exercise the real booking service against independent MySQL connections.
      const [failureSeat] = await pool.execute(
        "INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, 'PAYFAIL', 'NA', 'AVAILABLE')",
        [fixture.created.coachId],
      )
      const service = createBookingService(pool, {
        async charge({ outcome }) { return { success: outcome !== 'failure' } },
      }, { today: () => new Date().toISOString().slice(0, 10) })
      const bookingRequest = (seatId, paymentOutcome) => ({
        scheduleId: fixture.created.scheduleId,
        source: fixture.created.sourceCode,
        destination: fixture.created.destinationCode,
        classType: 'SL',
        seatIds: [seatId],
        passengers: [{ name: 'Booking Integration', age: 30, gender: 'UNDISCLOSED' }],
        paymentOutcome,
      })
      const availabilityBeforeFailure = await getAvailability()
      await assert.rejects(
        service.create(fixture.created.userId, bookingRequest(failureSeat.insertId, 'failure')),
        (error) => error.statusCode === 402 && error.code === 'PAYMENT_FAILED',
      )
      assert.equal(await getAvailability(), availabilityBeforeFailure)
      const [[failedRow]] = await pool.execute(
        `SELECT booking_id AS bookingId, status, pnr FROM bookings
         WHERE user_id = ? AND schedule_id = ? AND status = 'PAYMENT_FAILED' AND pnr IS NULL
         ORDER BY booking_id DESC LIMIT 1`,
        [fixture.created.userId, fixture.created.scheduleId],
      )
      assert.ok(failedRow)
      fixture.bookingIds.paymentFailed = failedRow.bookingId
      const [[failedAllocation]] = await pool.execute(
        'SELECT allocation_status AS status FROM booking_seats WHERE booking_id = ?',
        [failedRow.bookingId],
      )
      assert.equal(failedAllocation.status, 'RELEASED')
      const [[failedPayment]] = await pool.execute(
        'SELECT status FROM payments WHERE booking_id = ?', [failedRow.bookingId],
      )
      assert.equal(failedPayment.status, 'FAILED')

      const beforeSuccess = await getAvailability()
      const confirmed = await service.create(fixture.created.userId, bookingRequest(failureSeat.insertId))
      assert.equal(confirmed.status, 'CONFIRMED')
      assert.equal(confirmed.pnr.length, 12)
      assert.equal(await getAvailability(), beforeSuccess - 1)
      const [[confirmedRow]] = await pool.execute(
        'SELECT booking_id AS bookingId, status FROM bookings WHERE pnr = ?', [confirmed.pnr],
      )
      assert.equal(confirmedRow.status, 'CONFIRMED')
      fixture.bookingIds.paymentSuccess = confirmedRow.bookingId
      const [[successfulPayment]] = await pool.execute(
        'SELECT status FROM payments WHERE booking_id = ?', [confirmedRow.bookingId],
      )
      assert.equal(successfulPayment.status, 'SUCCESS')
      const retrieved = await service.getPassengerBookingByPnr(fixture.created.userId, confirmed.pnr.toLowerCase())
      assert.equal(retrieved.bookingId, Number(confirmedRow.bookingId))
      assert.equal(retrieved.pnr, confirmed.pnr)
      assert.equal(retrieved.status, 'CONFIRMED')
      assert.equal(retrieved.paymentStatus, 'SUCCESS')
      assert.equal(retrieved.origin.code, fixture.created.sourceCode)
      assert.equal(retrieved.destination.code, fixture.created.destinationCode)
      assert.equal(retrieved.passengers[0].name, 'Booking Integration')
      assert.equal(retrieved.passengers[0].seatNumber, 'PAYFAIL')
      const ownerHistory = await service.getPassengerBookings(fixture.created.userId)
      assert.ok(ownerHistory.some((booking) => booking.pnr === confirmed.pnr))
      const [outsider] = await pool.execute(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ('Issue 15 outsider', ?, 'test-only-hash', 'PASSENGER')`,
        [`issue15-outsider-${fixture.token}@example.invalid`],
      )
      try {
        await assert.rejects(
          service.getPassengerBookingByPnr(outsider.insertId, confirmed.pnr),
          (error) => error.statusCode === 404 && error.code === 'BOOKING_NOT_FOUND',
        )
        assert.deepEqual(await service.getPassengerBookings(outsider.insertId), [])
      } finally {
        await pool.execute('DELETE FROM users WHERE user_id = ?', [outsider.insertId])
      }

      // Concurrent cancellation requests and a new allocation race against
      // the real schedule, booking, and generated active-seat locks.
      const [cancellationSeat] = await pool.execute(
        "INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, 'CANCEL1', 'NA', 'AVAILABLE')",
        [fixture.created.coachId],
      )
      const cancellationTarget = await service.create(
        fixture.created.userId,
        bookingRequest(cancellationSeat.insertId),
      )
      fixture.bookingIds.cancellationTarget = cancellationTarget.bookingId
      const availabilityBeforeCancellationRace = await getAvailability()

      const cancellationRace = await Promise.allSettled([
        service.cancel(fixture.created.userId, cancellationTarget.bookingId),
        service.cancel(fixture.created.userId, cancellationTarget.bookingId),
        service.create(fixture.created.userId, bookingRequest(cancellationSeat.insertId)),
      ])
      assert.equal(
        cancellationRace.slice(0, 2).filter((result) => result.status === 'fulfilled' && result.value.status === 'CANCELLED').length,
        1,
      )
      assert.equal(
        cancellationRace.slice(0, 2).filter((result) => result.status === 'rejected' && result.reason.code === 'BOOKING_NOT_CANCELLABLE').length,
        1,
      )
      const concurrentReplacement = cancellationRace[2]
      assert.ok(
        concurrentReplacement.status === 'fulfilled' ||
        (concurrentReplacement.status === 'rejected' && concurrentReplacement.reason.code === 'SEATS_UNAVAILABLE'),
      )

      const [[cancelledRow]] = await pool.execute(
        'SELECT status FROM bookings WHERE booking_id = ?',
        [cancellationTarget.bookingId],
      )
      assert.equal(cancelledRow.status, 'CANCELLED')
      const [[releasedRows]] = await pool.execute(
        `SELECT COUNT(*) AS count FROM booking_seats
         WHERE booking_id = ? AND allocation_status = 'RELEASED'`,
        [cancellationTarget.bookingId],
      )
      assert.equal(Number(releasedRows.count), 1)
      const [[activeCancelledRows]] = await pool.execute(
        `SELECT COUNT(*) AS count FROM booking_seats
         WHERE booking_id = ? AND allocation_status IN ('HELD', 'CONFIRMED')`,
        [cancellationTarget.bookingId],
      )
      assert.equal(Number(activeCancelledRows.count), 0)
      const [[cancellationRows]] = await pool.execute(
        'SELECT COUNT(*) AS count FROM cancellations WHERE booking_id = ?',
        [cancellationTarget.bookingId],
      )
      assert.equal(Number(cancellationRows.count), 1)
      const [[cancelledPayment]] = await pool.execute(
        'SELECT status FROM payments WHERE booking_id = ?',
        [cancellationTarget.bookingId],
      )
      assert.equal(cancelledPayment.status, 'SUCCESS')
      const cancellationHistory = await service.getPassengerBookings(fixture.created.userId)
      assert.ok(cancellationHistory.some((booking) =>
        Number(booking.bookingId) === Number(cancellationTarget.bookingId) && booking.status === 'CANCELLED',
      ))
      const [[cancelAudit]] = await pool.execute(
        `SELECT COUNT(*) AS count FROM audit_logs
         WHERE actor_user_id = ? AND action = 'BOOKING_CANCELLED' AND entity_id = ?`,
        [fixture.created.userId, String(cancellationTarget.bookingId)],
      )
      assert.equal(Number(cancelAudit.count), 1)

      if (concurrentReplacement.status === 'fulfilled') {
        fixture.bookingIds.cancelReplacement = concurrentReplacement.value.bookingId
      } else {
        const replacement = await service.create(
          fixture.created.userId,
          bookingRequest(cancellationSeat.insertId),
        )
        fixture.bookingIds.cancelReplacement = replacement.bookingId
      }
      const [[replacementAllocation]] = await pool.execute(
        `SELECT COUNT(*) AS count FROM booking_seats
         WHERE booking_id = ? AND seat_id = ? AND allocation_status = 'CONFIRMED'`,
        [fixture.bookingIds.cancelReplacement, cancellationSeat.insertId],
      )
      assert.equal(Number(replacementAllocation.count), 1)
      assert.equal(await getAvailability(), availabilityBeforeCancellationRace)

      // Force a failure after the booking status update on a real transaction;
      // rollback must leave the booking and allocation active and create no history.
      const [cancellationRollbackSeat] = await pool.execute(
        "INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, 'CANCRB', 'NA', 'AVAILABLE')",
        [fixture.created.coachId],
      )
      const rollbackTarget = await service.create(
        fixture.created.userId,
        bookingRequest(cancellationRollbackSeat.insertId),
      )
      fixture.bookingIds.cancellationRollback = rollbackTarget.bookingId
      const availabilityBeforeCancellationRollback = await getAvailability()
      const cancellationFailingDatabase = {
        async getConnection() {
          const connection = await pool.getConnection()
          return {
            beginTransaction: () => connection.beginTransaction(),
            commit: () => connection.commit(),
            rollback: () => connection.rollback(),
            release: () => connection.release(),
            execute(sql, params) {
              if (sql.includes("SET allocation_status = 'RELEASED'")) {
                throw new Error('forced cancellation allocation failure')
              }
              return connection.execute(sql, params)
            },
          }
        },
      }
      const cancellationFailingService = createBookingService(cancellationFailingDatabase, {})
      await assert.rejects(
        cancellationFailingService.cancel(fixture.created.userId, rollbackTarget.bookingId),
        /forced cancellation allocation failure/,
      )
      const [[rollbackBookingState]] = await pool.execute(
        'SELECT status FROM bookings WHERE booking_id = ?',
        [rollbackTarget.bookingId],
      )
      assert.equal(rollbackBookingState.status, 'CONFIRMED')
      const [[rollbackAllocationState]] = await pool.execute(
        'SELECT allocation_status AS status FROM booking_seats WHERE booking_id = ?',
        [rollbackTarget.bookingId],
      )
      assert.equal(rollbackAllocationState.status, 'CONFIRMED')
      const [[rollbackCancellationCount]] = await pool.execute(
        'SELECT COUNT(*) AS count FROM cancellations WHERE booking_id = ?',
        [rollbackTarget.bookingId],
      )
      assert.equal(Number(rollbackCancellationCount.count), 0)
      assert.equal(await getAvailability(), availabilityBeforeCancellationRollback)

      const [raceSeat] = await pool.execute(
        "INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, 'PAYRACE', 'NA', 'AVAILABLE')",
        [fixture.created.coachId],
      )
      const competingBookings = await Promise.allSettled([
        service.create(fixture.created.userId, bookingRequest(raceSeat.insertId)),
        service.create(fixture.created.userId, bookingRequest(raceSeat.insertId)),
      ])
      assert.equal(competingBookings.filter((result) => result.status === 'fulfilled').length, 1)
      assert.equal(competingBookings.filter((result) => result.status === 'rejected' && result.reason.code === 'SEATS_UNAVAILABLE').length, 1)
      const winner = competingBookings.find((result) => result.status === 'fulfilled').value
      const [[raceAllocation]] = await pool.execute(
        `SELECT COUNT(*) AS count FROM booking_seats bs
         JOIN bookings b ON b.booking_id = bs.booking_id
         WHERE bs.seat_id = ? AND bs.allocation_status = 'CONFIRMED' AND b.status = 'CONFIRMED'`,
        [raceSeat.insertId],
      )
      assert.equal(Number(raceAllocation.count), 1)
      const [[raceWinner]] = await pool.execute('SELECT booking_id AS bookingId FROM bookings WHERE pnr = ?', [winner.pnr])
      fixture.bookingIds.paymentRaceWinner = raceWinner.bookingId

      // Distinct seats remain bookable concurrently through the real service.
      const [parallelSeatA] = await pool.execute(
        "INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, 'PARA', 'NA', 'AVAILABLE')",
        [fixture.created.coachId],
      )
      const [parallelSeatB] = await pool.execute(
        "INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, 'PARB', 'NA', 'AVAILABLE')",
        [fixture.created.coachId],
      )
      const availabilityBeforeParallel = await getAvailability()
      const parallelBookings = await Promise.all([
        service.create(fixture.created.userId, bookingRequest(parallelSeatA.insertId)),
        service.create(fixture.created.userId, bookingRequest(parallelSeatB.insertId)),
      ])
      assert.equal(parallelBookings.every((booking) => booking.status === 'CONFIRMED'), true)
      assert.equal(await getAvailability(), availabilityBeforeParallel - 2)
      for (const [index, booking] of parallelBookings.entries()) {
        const [[row]] = await pool.execute('SELECT booking_id AS bookingId FROM bookings WHERE pnr = ?', [booking.pnr])
        fixture.bookingIds[`parallel${index}`] = row.bookingId
      }

      // Repeat same-seat booking races with five independent requests.
      for (let round = 1; round <= 3; round += 1) {
        const [stressSeat] = await pool.execute(
          'INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, ?, \'NA\', \'AVAILABLE\')',
          [fixture.created.coachId, `STR${round}`],
        )

        const results = await Promise.allSettled(
          Array.from({ length: 5 }, () =>
            service.create(
              fixture.created.userId,
              bookingRequest(stressSeat.insertId),
            ),
          ),
        )

        const successful = results.filter((result) => result.status === 'fulfilled')
        const rejected = results.filter((result) => result.status === 'rejected')

        assert.equal(successful.length, 1, `round ${round}: exactly one booking must succeed`)
        assert.equal(rejected.length, 4, `round ${round}: four competing bookings must fail`)
        assert.ok(
          rejected.every((result) => result.reason.code === 'SEATS_UNAVAILABLE'),
          `round ${round}: competing bookings must fail because the seat is unavailable`,
        )

        const [[allocation]] = await pool.execute(
          `SELECT COUNT(*) AS count
           FROM booking_seats
           WHERE seat_id = ? AND allocation_status IN ('HELD', 'CONFIRMED')`,
          [stressSeat.insertId],
        )

        assert.equal(Number(allocation.count), 1, `round ${round}: only one active allocation is allowed`)

        fixture.bookingIds[`stress${round}`] = successful[0].value.bookingId
      }

      // A failure after writes have started must roll back booking, passenger,
      // payment, allocation and inventory changes in the real database.
      const [rollbackSeat] = await pool.execute(
        "INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, 'ROLLB', 'NA', 'AVAILABLE')",
        [fixture.created.coachId],
      )
      const [beforeRollbackBookings] = await pool.execute(
        'SELECT COUNT(*) AS count FROM bookings WHERE user_id = ? AND schedule_id = ?',
        [fixture.created.userId, fixture.created.scheduleId],
      )
      const [beforeRollbackPayments] = await pool.execute(
        `SELECT COUNT(*) AS count FROM payments p JOIN bookings b ON b.booking_id = p.booking_id
         WHERE b.user_id = ? AND b.schedule_id = ?`,
        [fixture.created.userId, fixture.created.scheduleId],
      )
      const availabilityBeforeRollback = await getAvailability()
      const failingService = createBookingService(pool, {
        async charge() { throw new Error('forced payment adapter failure') },
      }, { today: () => new Date().toISOString().slice(0, 10) })
      await assert.rejects(
        failingService.create(fixture.created.userId, bookingRequest(rollbackSeat.insertId)),
        /forced payment adapter failure/,
      )
      const [afterRollbackBookings] = await pool.execute(
        'SELECT COUNT(*) AS count FROM bookings WHERE user_id = ? AND schedule_id = ?',
        [fixture.created.userId, fixture.created.scheduleId],
      )
      const [afterRollbackPayments] = await pool.execute(
        `SELECT COUNT(*) AS count FROM payments p JOIN bookings b ON b.booking_id = p.booking_id
         WHERE b.user_id = ? AND b.schedule_id = ?`,
        [fixture.created.userId, fixture.created.scheduleId],
      )
      assert.equal(Number(afterRollbackBookings[0].count), Number(beforeRollbackBookings[0].count))
      assert.equal(Number(afterRollbackPayments[0].count), Number(beforeRollbackPayments[0].count))
      assert.equal(await getAvailability(), availabilityBeforeRollback)

    } finally {
      await connectionA.rollback().catch(() => {})
      await connectionB.rollback().catch(() => {})
      connectionA.release()
      connectionB.release()
    }

    // Exercise administrator master-data operations against real MySQL, then
    // prove their route, fare, schedule and seat changes reach passenger search.
    const [adminUser] = await pool.execute(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Issue 18 integration admin', ?, 'test-only-hash', 'ADMIN')`,
      [`issue18-admin-${fixture.token}@example.invalid`],
    )
    fixture.created.adminUserId = adminUser.insertId
    const adminService = createAdminManagementService(pool)
    const adminRoute = [
      { stationCode: fixture.created.sourceCode, arrivalTime: null, departureTime: '09:00:00', dayOffset: 0 },
      { stationCode: fixture.created.destinationCode, arrivalTime: '10:00:00', departureTime: null, dayOffset: 0 },
    ]
    const managedTrain = await adminService.createTrain(adminUser.insertId, {
      trainNumber: `A18${fixture.token.slice(0, 7)}`,
      trainName: `Issue 18 Admin ${fixture.token}`,
      routeStops: adminRoute,
    })
    fixture.created.adminTrainId = managedTrain.trainId
    const updatedManagedTrain = await adminService.updateTrain(adminUser.insertId, managedTrain.trainId, {
      trainNumber: managedTrain.trainNumber,
      trainName: `${managedTrain.trainName} Updated`,
      active: true,
      routeStops: adminRoute,
    })
    assert.equal(updatedManagedTrain.trainName, `${managedTrain.trainName} Updated`)
    const listedManagedTrain = (await adminService.listTrains()).find((train) => train.trainId === managedTrain.trainId)
    assert.deepEqual(listedManagedTrain.routeStops.map((stop) => stop.stationCode), [
      fixture.created.sourceCode, fixture.created.destinationCode,
    ])
    const managedDate = new Date()
    managedDate.setUTCDate(managedDate.getUTCDate() + 40)
    const firstManagedDate = managedDate.toISOString().slice(0, 10)
    const managedSchedule = await adminService.createSchedule(adminUser.insertId, {
      trainId: managedTrain.trainId,
      journeyDate: firstManagedDate,
    })
    fixture.created.adminScheduleId = managedSchedule.scheduleId
    assert.ok((await adminService.listSchedules()).some((schedule) => schedule.scheduleId === managedSchedule.scheduleId))
    await adminService.saveFare(adminUser.insertId, managedSchedule.scheduleId, {
      classType: 'SL', amount: '100.00', currency: 'INR',
    })
    assert.equal((await adminService.listFares(managedSchedule.scheduleId))[0].amount, '100.00')
    const managedCoach = await adminService.addCoach(adminUser.insertId, managedSchedule.scheduleId, {
      classType: 'SL', coachNumber: 'A18C1',
      seats: [
        { seatNumber: '01', berthType: 'LOWER', status: 'AVAILABLE' },
        { seatNumber: '02', berthType: 'UPPER', status: 'AVAILABLE' },
      ],
    })
    assert.equal(managedCoach.seats.length, 2)
    const listedCoaches = await adminService.listInventory(managedSchedule.scheduleId)
    assert.equal(listedCoaches[0].seats.length, 2)
    const [[managedSeat]] = await pool.execute(
      'SELECT seat_id AS seatId FROM seats WHERE coach_id = ? AND seat_number = ?',
      [managedCoach.coachId, '02'],
    )
    const searchManaged = async (date) => searchTrains({
      source: fixture.created.sourceCode,
      destination: fixture.created.destinationCode,
      date,
    })
    let managedOptions = await searchManaged(firstManagedDate)
    const initialOption = managedOptions.find((option) => Number(option.scheduleId) === managedSchedule.scheduleId)
    assert.ok(initialOption, 'created route and schedule should appear in train search')
    assert.equal(initialOption.fare.amount, 100)
    assert.equal(initialOption.availableSeats, 2)

    await adminService.saveFare(adminUser.insertId, managedSchedule.scheduleId, {
      classType: 'SL', amount: '175.50', currency: 'INR',
    })
    await adminService.updateSeat(adminUser.insertId, managedSeat.seatId, {
      seatNumber: '02', berthType: 'UPPER', status: 'BLOCKED',
    })
    managedOptions = await searchManaged(firstManagedDate)
    const changedOption = managedOptions.find((option) => Number(option.scheduleId) === managedSchedule.scheduleId)
    assert.ok(changedOption)
    assert.equal(changedOption.fare.amount, 175.5)
    assert.equal(changedOption.availableSeats, 1)

    const secondManagedDate = new Date(managedDate.getTime())
    secondManagedDate.setUTCDate(secondManagedDate.getUTCDate() + 1)
    const updatedDate = secondManagedDate.toISOString().slice(0, 10)
    await adminService.updateSchedule(adminUser.insertId, managedSchedule.scheduleId, {
      journeyDate: updatedDate,
      status: 'SCHEDULED',
    })
    assert.equal((await searchManaged(firstManagedDate)).some((option) => Number(option.scheduleId) === managedSchedule.scheduleId), false)
    assert.equal((await searchManaged(updatedDate)).some((option) => Number(option.scheduleId) === managedSchedule.scheduleId), true)
    await adminService.updateSchedule(adminUser.insertId, managedSchedule.scheduleId, {
      journeyDate: updatedDate,
      status: 'CANCELLED',
    })
    assert.equal((await searchManaged(updatedDate)).some((option) => Number(option.scheduleId) === managedSchedule.scheduleId), false)
    await adminService.updateSchedule(adminUser.insertId, managedSchedule.scheduleId, {
      journeyDate: updatedDate,
      status: 'SCHEDULED',
    })
    await adminService.updateTrain(adminUser.insertId, managedTrain.trainId, {
      trainNumber: managedTrain.trainNumber,
      trainName: managedTrain.trainName,
      active: false,
    })
    assert.equal((await searchManaged(updatedDate)).some((option) => Number(option.scheduleId) === managedSchedule.scheduleId), false)
  } finally {
    await cleanupFixture()
    await pool.end()
  }
})
