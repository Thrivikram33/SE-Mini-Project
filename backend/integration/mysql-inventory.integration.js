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
if (process.env.RRS_MYSQL_TEST_DATABASE !== 'railway_reservation_issue4_test') {
  throw new Error('MySQL integration tests require RRS_MYSQL_TEST_DATABASE=railway_reservation_issue4_test; refusing any other database.')
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
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent && [servicePath, seatServicePath].includes(parent.filename) && request === '../config/db') return pool
  return originalLoad.call(this, request, parent, isMain)
}
let searchTrains
let getSeatsForClass
try {
  ;({ searchTrains } = require(servicePath))
  ;({ getSeatsForClass } = require(seatServicePath))
} finally {
  Module._load = originalLoad
}

const fixture = {
  token: crypto.randomBytes(4).toString('hex').toUpperCase(),
  created: {},
  bookingSeats: {},
  seatIds: {},
  bookingIds: {},
  passengerIds: {},
}

async function applySchemaToDedicatedTestDatabase() {
  const [[database]] = await pool.query('SELECT DATABASE() AS databaseName')
  assert.equal(database.databaseName, 'railway_reservation_issue4_test')

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
  for (const statement of createStatements) {
    await pool.query(statement)
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
  const bookingIds = Object.values(fixture.bookingIds)
  if (bookingIds.length) {
    const placeholders = bookingIds.map(() => '?').join(', ')
    await pool.execute(`DELETE FROM booking_seats WHERE booking_id IN (${placeholders})`, bookingIds)
    await pool.execute(`DELETE FROM passengers WHERE booking_id IN (${placeholders})`, bookingIds)
    await pool.execute(`DELETE FROM bookings WHERE booking_id IN (${placeholders})`, bookingIds)
  }
  if (ids.coachId) await pool.execute('DELETE FROM seats WHERE coach_id = ?', [ids.coachId])
  if (ids.scheduleId) await pool.execute('DELETE FROM fares WHERE schedule_id = ?', [ids.scheduleId])
  if (ids.coachId) await pool.execute('DELETE FROM coaches WHERE coach_id = ?', [ids.coachId])
  if (ids.scheduleId) await pool.execute('DELETE FROM schedules WHERE schedule_id = ?', [ids.scheduleId])
  if (ids.trainId) await pool.execute('DELETE FROM route_stops WHERE train_id = ?', [ids.trainId])
  if (ids.trainId) await pool.execute('DELETE FROM trains WHERE train_id = ?', [ids.trainId])
  if (ids.sourceId) await pool.execute('DELETE FROM stations WHERE station_id = ?', [ids.sourceId])
  if (ids.destinationId) await pool.execute('DELETE FROM stations WHERE station_id = ?', [ids.destinationId])
  if (ids.userId) await pool.execute('DELETE FROM users WHERE user_id = ?', [ids.userId])
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
    } finally {
      await connectionA.rollback().catch(() => {})
      await connectionB.rollback().catch(() => {})
      connectionA.release()
      connectionB.release()
    }
  } finally {
    await cleanupFixture()
    await pool.end()
  }
})
