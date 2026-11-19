const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeStation } = require('../scripts/stationDataset')
const { normalizeTrainRecord } = require('../scripts/trainDataset')
const { requireDevelopmentTarget } = require('../scripts/import-stations')
const { readInitialSchema } = require('../scripts/migrate-initial-schema')

test('station normalization uses codes and names from the dataset and leaves missing locality blank', () => {
  assert.deepEqual(normalizeStation({
    code: ' abc ',
    name: ' Alpha Station ',
  }), {
    station: { code: 'ABC', name: 'Alpha Station', city: '' },
    missingCity: true,
  })
})

test('station normalization extracts locality from address without using station name as a city', () => {
  assert.deepEqual(normalizeStation({
    code: 'abc',
    name: 'Alpha Station',
    address: 'Alpha City, Example State',
    state: 'Example State',
  }), {
    station: { code: 'ABC', name: 'Alpha Station', city: 'Alpha City' },
    missingCity: false,
  })
})

test('data writes are restricted to the confirmed development database name', () => {
  assert.doesNotThrow(() => requireDevelopmentTarget({
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_NAME: 'railway_reservation_dev',
  }))
  assert.throws(() => requireDevelopmentTarget({
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_NAME: 'railway_reservation',
  }), /Refusing database operation/)
  assert.throws(() => requireDevelopmentTarget({
    NODE_ENV: 'production',
    DB_HOST: '127.0.0.1',
    DB_NAME: 'railway_reservation_dev',
  }), /Refusing database operation/)
  assert.throws(() => requireDevelopmentTarget({
    NODE_ENV: 'development',
    DB_HOST: 'database.example.test',
    DB_NAME: 'railway_reservation_dev',
  }), /Refusing database operation/)
})

test('initial schema migration is additive and the hardcoded database selector is removed by the guarded runner', () => {
  const { statements, tableNames } = readInitialSchema()
  assert.equal(statements.length, 14)
  assert.equal(tableNames.length, 14)
  assert.ok(statements.every(statement => /^CREATE TABLE IF NOT EXISTS/i.test(statement)))
})

for (const [label, station] of [
  ['placeholder code', { code: 'XX-UNKNOWN', name: 'Unknown' }],
  ['missing code', { name: 'No code' }],
  ['overlong code', { code: 'ABCDEFGHIJK', name: 'Long code' }],
]) {
  test(`station normalization rejects ${label}`, () => {
    assert.ok(normalizeStation(station).reason)
  })
}

const stationIds = new Map([
  ['AAA', 11],
  ['BBB', 12],
  ['CCC', 13],
])

function trainRecord(overrides = {}) {
  return {
    trainNumber: '12345',
    trainName: 'Test Express',
    source: { code: 'BBB' },
    destination: { code: 'CCC' },
    runningDays: { SUN: true, MON: false, TUE: true },
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'AAA', journeyDay: 1, arrivalTime: null, departureTime: '20:00:00' },
      { sequence: 2, stationCode: 'BBB', journeyDay: 2, arrivalTime: '01:00:00', departureTime: '01:05:00' },
      { sequence: 3, stationCode: 'CCC', journeyDay: 2, arrivalTime: '04:00:00', departureTime: null },
    ],
    ...overrides,
  }
}

test('train normalization trims route stops outside declared endpoints and rebases offsets', () => {
  const result = normalizeTrainRecord(trainRecord(), stationIds)
  assert.equal(result.reason, undefined)
  assert.equal(result.trimmedLeadingStops, 1)
  assert.equal(result.trimmedTrailingStops, 0)
  assert.deepEqual(result.train.route.map(stop => [stop.stationCode, stop.sequence, stop.dayOffset]), [
    ['BBB', 1, 0],
    ['CCC', 2, 0],
  ])
  assert.equal(result.train.route[0].stationId, 12)
  assert.deepEqual(result.train.runningDays, [0, 2])
})

test('train normalization keeps the supplied stop order and rejects duplicate route stations', () => {
  const result = normalizeTrainRecord(trainRecord({
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'BBB', journeyDay: 1, arrivalTime: null, departureTime: '08:00:00' },
      { sequence: 2, stationCode: 'AAA', journeyDay: 1, arrivalTime: '09:00:00', departureTime: '09:05:00' },
      { sequence: 3, stationCode: 'CCC', journeyDay: 1, arrivalTime: '10:00:00', departureTime: null },
    ],
  }), stationIds)
  assert.equal(result.reason, undefined)
  assert.deepEqual(result.train.route.map(stop => stop.stationCode), ['BBB', 'AAA', 'CCC'])

  const duplicate = normalizeTrainRecord(trainRecord({
    source: { code: 'AAA' },
    destination: { code: 'CCC' },
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'AAA', journeyDay: 1, arrivalTime: null, departureTime: '08:00:00' },
      { sequence: 2, stationCode: 'BBB', journeyDay: 1, arrivalTime: '09:00:00', departureTime: '09:05:00' },
      { sequence: 3, stationCode: 'AAA', journeyDay: 1, arrivalTime: '09:30:00', departureTime: '09:35:00' },
      { sequence: 4, stationCode: 'CCC', journeyDay: 1, arrivalTime: '10:00:00', departureTime: null },
    ],
  }), stationIds)
  assert.equal(duplicate.reason, 'DUPLICATE_ROUTE_STATION')
})

for (const [label, overrides, expectedReason] of [
  ['source absent from route', { source: { code: 'ZZZ' } }, 'SOURCE_NOT_IN_ROUTE'],
  ['destination before source', { source: { code: 'CCC' }, destination: { code: 'BBB' } }, 'DESTINATION_NOT_AFTER_SOURCE'],
  ['missing station foreign key', {
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'BBB', journeyDay: 1, arrivalTime: null, departureTime: '08:00:00' },
      { sequence: 2, stationCode: 'ZZZ', journeyDay: 1, arrivalTime: '09:00:00', departureTime: '09:05:00' },
      { sequence: 3, stationCode: 'CCC', journeyDay: 1, arrivalTime: '10:00:00', departureTime: null },
    ],
  }, 'MISSING_STATION'],
  ['missing weekly service days', { runningDays: {} }, 'MISSING_RUNNING_DAYS'],
  ['invalid route time', {
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'BBB', journeyDay: 1, arrivalTime: null, departureTime: '25:00:00' },
      { sequence: 2, stationCode: 'CCC', journeyDay: 1, arrivalTime: '10:00:00', departureTime: null },
    ],
  }, 'INVALID_TIME'],
]) {
  test(`train normalization rejects ${label}`, () => {
    assert.equal(normalizeTrainRecord(trainRecord(overrides), stationIds).reason, expectedReason)
  })
}

test('train normalization retains route records with missing endpoint times without inventing times', () => {
  const result = normalizeTrainRecord(trainRecord({
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'BBB', journeyDay: 1, arrivalTime: null, departureTime: null },
      { sequence: 2, stationCode: 'CCC', journeyDay: 1, arrivalTime: null, departureTime: null },
    ],
  }), stationIds)

  assert.equal(result.reason, undefined)
  assert.equal(result.missingSourceDeparture, true)
  assert.equal(result.missingDestinationArrival, true)
  assert.equal(result.train.route[0].departureTime, null)
  assert.equal(result.train.route[1].arrivalTime, null)
})

test('train normalization retains explicit route order and reports inconsistent time chronology', () => {
  const result = normalizeTrainRecord(trainRecord({
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'BBB', journeyDay: 1, arrivalTime: null, departureTime: '12:00:00' },
      { sequence: 2, stationCode: 'CCC', journeyDay: 1, arrivalTime: '10:00:00', departureTime: null },
    ],
  }), stationIds)

  assert.equal(result.reason, undefined)
  assert.equal(result.invalidChronology, true)
  assert.deepEqual(result.train.route.map(stop => stop.stationCode), ['BBB', 'CCC'])
})

test('train normalization rejects malformed time values', () => {
  const result = normalizeTrainRecord(trainRecord({
    completeOrderedRoute: [
      { sequence: 1, stationCode: 'BBB', journeyDay: 1, arrivalTime: null, departureTime: '25:00:00' },
      { sequence: 2, stationCode: 'CCC', journeyDay: 1, arrivalTime: '10:00:00', departureTime: null },
    ],
  }), stationIds)

  assert.equal(result.reason, 'INVALID_TIME')
})
