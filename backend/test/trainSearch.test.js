const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const servicePath = path.resolve(__dirname, '../src/services/trainSearchService.js')
const originalLoad = Module._load
let queryBehavior
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === servicePath && request === '../config/db') {
    return { execute: (...args) => queryBehavior(...args) }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let searchTrains
try {
  ;({ searchTrains } = require(servicePath))
} finally {
  Module._load = originalLoad
}

function futureDate(days = 30) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function stationRows() {
  return [
    { stationId: 1, code: 'AAA', name: 'Alpha' },
    { stationId: 2, code: 'BBB', name: 'Beta' },
  ]
}

function searchRow(overrides = {}) {
  return {
    trainId: 7,
    trainNumber: '12001',
    trainName: 'Test Express',
    scheduleId: 31,
    journeyDate: futureDate(),
    sourceCode: 'AAA',
    sourceName: 'Alpha',
    departureTime: '23:30:00',
    sourceDayOffset: 0,
    destinationCode: 'BBB',
    destinationName: 'Beta',
    arrivalTime: '01:15:00',
    destinationDayOffset: 1,
    classType: 'SL',
    fare: '250.00',
    currency: 'INR',
    availableSeats: 4,
    ...overrides,
  }
}

function mockDatabase(rows = [searchRow()], matches = stationRows()) {
  const calls = []
  queryBehavior = async (sql, params) => {
    calls.push({ sql, params })
    return [sql.includes('FROM stations') ? matches : rows]
  }
  return calls
}

function query() {
  return { source: ' Alpha ', destination: ' beta ', date: futureDate() }
}

test('TC-SEARCH-01: returns schedules for a matching route and journey date', async () => {
  const calls = mockDatabase([searchRow()])
  const trains = await searchTrains(query())
  assert.equal(trains.length, 1)
  assert.equal(trains[0].scheduleId, 31)
  assert.deepEqual(calls[1].params, [futureDate(), 'Alpha', 'Alpha', 'beta', 'beta'])
})

test('TC-SEARCH-02: returns configured train, stop, class, fare, and availability fields', async () => {
  mockDatabase([searchRow()])
  const [train] = await searchTrains(query())
  assert.deepEqual(train, {
    trainId: 7,
    trainNumber: '12001',
    trainName: 'Test Express',
    scheduleId: 31,
    source: { code: 'AAA', name: 'Alpha' },
    destination: { code: 'BBB', name: 'Beta' },
    departureTime: '23:30:00',
    arrivalTime: '01:15:00',
    journeyDate: futureDate(),
    durationMinutes: 105,
    arrivalDaysAfterDeparture: 1,
    classType: 'SL',
    fare: { amount: 250, currency: 'INR' },
    availableSeats: 4,
  })
})

for (const missing of ['source', 'destination', 'date']) {
  test(`rejects missing ${missing}`, async () => {
    queryBehavior = () => assert.fail('database should not be queried')
    await assert.rejects(
      () => searchTrains({ ...query(), [missing]: undefined }),
      { statusCode: 400 },
    )
  })
}

for (const [field, value] of [['source', '   '], ['destination', ''], ['date', '  ']]) {
  test(`rejects empty or whitespace-only ${field}`, async () => {
    queryBehavior = () => assert.fail('database should not be queried')
    await assert.rejects(() => searchTrains({ ...query(), [field]: value }), { statusCode: 400 })
  })
}

for (const date of ['10/21/2026', '2026-02-30', '2024-13-01', '0000-01-01']) {
  test(`rejects invalid journey date ${date}`, async () => {
    queryBehavior = () => assert.fail('database should not be queried')
    await assert.rejects(() => searchTrains({ ...query(), date }), { statusCode: 400 })
  })
}

test('rejects an identical station submitted with the same spelling', async () => {
  queryBehavior = () => assert.fail('database should not be queried')
  await assert.rejects(
    () => searchTrains({ ...query(), source: ' Alpha ', destination: 'alpha' }),
    { statusCode: 400 },
  )
})

test('rejects aliases that resolve to the same station ID', async () => {
  const calls = mockDatabase([], [{ stationId: 1, code: 'AAA', name: 'Alpha' }])
  await assert.rejects(
    () => searchTrains({ ...query(), source: 'AAA', destination: 'Alpha' }),
    { statusCode: 400 },
  )
  assert.equal(calls.length, 1)
})

test('uses ordered route stops and filters inactive trains and invalid schedules', async () => {
  const calls = mockDatabase([])
  assert.deepEqual(await searchTrains(query()), [])
  const sql = calls[1].sql
  assert.match(sql, /destination_stop\.sequence_no > source_stop\.sequence_no/)
  assert.match(sql, /t\.active = TRUE/)
  assert.match(sql, /s\.status = 'SCHEDULED'/)
  assert.match(sql, /s\.journey_date = DATE_SUB\(\?, INTERVAL source_stop\.day_offset DAY\)/)
  assert.match(sql, /seat\.status = 'AVAILABLE'/)
  assert.match(sql, /allocation\.allocation_status IN \('HELD', 'CONFIRMED'\)/)
  assert.match(sql, /active_booking\.status IN \('PENDING_PAYMENT', 'CONFIRMED'\)/)
  assert.match(sql, /COUNT\(DISTINCT CASE/)
  assert.match(sql, /WHEN seat\.status = 'AVAILABLE' AND active_booking\.booking_id IS NULL/)
})

test('returns an empty trains collection when there are no route/date matches', async () => {
  mockDatabase([])
  assert.deepEqual(await searchTrains(query()), [])
})

test('binds SQL-injection-like station input in both database queries', async () => {
  const calls = mockDatabase([], [])
  const injection = "Alpha' OR 1=1 --"
  await searchTrains({ ...query(), source: injection })
  assert.equal(calls[0].sql.includes(injection), false)
  assert.equal(calls[0].params[0], injection)
  assert.equal(calls[1].sql.includes(injection), false)
  assert.ok(calls[1].params.includes(injection))
})

test('calculates overnight duration using the requested stops and day offsets', async () => {
  mockDatabase([searchRow()])
  const [train] = await searchTrains(query())
  assert.equal(train.durationMinutes, 105)
})

test('matches the requested source departure date when the train begins on an earlier day', async () => {
  const calls = mockDatabase([searchRow({ sourceDayOffset: 1, destinationDayOffset: 2 })])
  const [train] = await searchTrains(query())
  assert.equal(train.journeyDate, futureDate())
  assert.equal(train.arrivalDaysAfterDeparture, 1)
  assert.match(calls[1].sql, /DATE_ADD\(s\.journey_date, INTERVAL source_stop\.day_offset DAY\)/)
})

test('drops invalid stop times and arrival-before-departure schedule rows', async () => {
  mockDatabase([
    searchRow({ departureTime: null }),
    searchRow({ arrivalTime: '08:00:00', departureTime: '09:00:00', destinationDayOffset: 0 }),
  ])
  assert.deepEqual(await searchTrains(query()), [])
})

test('keeps multiple results and the SQL specifies deterministic ordering', async () => {
  const calls = mockDatabase([
    searchRow({ classType: 'SL' }),
    searchRow({ classType: '3A', fare: '500.00' }),
  ])
  const trains = await searchTrains(query())
  assert.equal(trains.length, 2)
  assert.match(calls[1].sql, /ORDER BY source_stop\.departure_time, t\.train_number, coach\.class_type/)
})

test('propagates database errors for safe handling by the HTTP error middleware', async () => {
  queryBehavior = async () => { throw new Error('private database detail') }
  await assert.rejects(() => searchTrains(query()), /private database detail/)
})

test('rejects past dates without imposing an undocumented booking horizon', async () => {
  const yesterday = new Date()
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  queryBehavior = () => assert.fail('database should not be queried')
  await assert.rejects(
    () => searchTrains({ ...query(), date: yesterday.toISOString().slice(0, 10) }),
    { statusCode: 400 },
  )
})
