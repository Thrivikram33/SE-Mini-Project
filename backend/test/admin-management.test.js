const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createAdminManagementService } = require('../src/services/adminManagementService')

const routeStops = [
  { stationCode: 'DMB', arrivalTime: null, departureTime: '09:00', dayOffset: 0 },
  { stationCode: 'DMC', arrivalTime: '12:00', departureTime: null, dayOffset: 0 },
]

function fixture(overrides = {}) {
  const calls = []
  let open = false
  const connection = {
    async beginTransaction() { calls.push(['begin']); open = true },
    async commit() { calls.push(['commit']); open = false },
    async rollback() { calls.push(['rollback']); open = false },
    release() { calls.push(['release']) },
  }
  const defaults = {
    listStations: async () => [], listTrains: async () => [], listSchedules: async () => [],
    stationIdsByCode: async (_conn, codes) => codes.map((code, index) => ({ code, stationId: index + 1 })),
    insertTrain: async (_conn, data) => { calls.push(['insertTrain', data]); return [{ insertId: 51 }] },
    replaceTrainRoute: async (_conn, id, stops, ids) => calls.push(['route', id, stops, ids]),
    getTrainForUpdate: async () => ({ trainId: 51 }),
    updateTrain: async (_conn, id, data) => calls.push(['updateTrain', id, data]),
    countTrainBookings: async () => 0,
    countTrainSchedules: async () => 0,
    countActiveTrainBookings: async () => 0,
    getTrain: async () => ({ trainId: 51, active: 1 }),
    countTrainRouteStops: async () => 2,
    insertSchedule: async (_conn, data) => { calls.push(['insertSchedule', data]); return [{ insertId: 61 }] },
    getScheduleForUpdate: async () => ({ scheduleId: 61, journeyDate: '2030-01-01', status: 'SCHEDULED' }),
    countScheduleBookings: async () => 0,
    updateSchedule: async (_conn, id, data) => calls.push(['updateSchedule', id, data]),
    listFares: async () => [], saveFare: async (_conn, id, data) => calls.push(['saveFare', id, data]),
    listInventory: async () => [], insertCoach: async () => [{ insertId: 71 }],
    insertSeat: async (_conn, id, data) => calls.push(['insertSeat', id, data]),
    getSeatForUpdate: async () => ({ seatId: 81, scheduleId: 61 }),
    countActiveSeatAllocations: async () => 0,
    updateSeat: async (_conn, id, data) => calls.push(['updateSeat', id, data]),
    audit: async (_conn, record) => calls.push(['audit', record]),
    ...overrides,
  }
  const service = createAdminManagementService({
    async getConnection() { return connection },
  }, { repository: defaults })
  return { service, calls, get open() { return open } }
}

test('creates a train with its ordered route atomically and records an audit entry', async () => {
  const { service, calls, open } = fixture()
  const train = await service.createTrain(9, {
    trainNumber: 'd-100', trainName: 'Demo Coastal Express', routeStops,
  })
  assert.equal(train.trainId, 51)
  assert.equal(train.trainNumber, 'D-100')
  assert.deepEqual(calls.find(([name]) => name === 'route')[3], new Map([['DMB', 1], ['DMC', 2]]))
  assert.ok(calls.some(([name, record]) => name === 'audit' && record.action === 'ADMIN_TRAIN_CREATED'))
  assert.deepEqual(calls.slice(0, 1), [['begin']])
  assert.equal(calls.at(-2)[0], 'commit')
  assert.equal(calls.at(-1)[0], 'release')
  assert.equal(open, false)
})

test('rejects invalid route definitions before opening a transaction', async () => {
  const { service, calls } = fixture()
  await assert.rejects(service.createTrain(9, {
    trainNumber: 'T-1', trainName: 'Invalid', routeStops: [routeStops[0]],
  }), (error) => error.statusCode === 400 && error.code === 'VALIDATION_ERROR')
  assert.equal(calls.length, 0)
})

test('rolls back when a route references an unknown station', async () => {
  const { service, calls } = fixture({ stationIdsByCode: async () => [{ code: 'DMB', stationId: 1 }] })
  await assert.rejects(service.createTrain(9, {
    trainNumber: 'T-1', trainName: 'Invalid route', routeStops,
  }), (error) => error.statusCode === 400 && error.code === 'INVALID_STATIONS')
  assert.deepEqual(calls.map(([name]) => name), ['begin', 'rollback', 'release'])
})

test('does not replace a train route once schedules reference it', async () => {
  const { service, calls } = fixture({ countTrainSchedules: async () => 1 })
  await assert.rejects(service.updateTrain(9, '51', {
    trainNumber: 'D-100', trainName: 'Renamed', active: true, routeStops,
  }), (error) => error.statusCode === 409 && error.code === 'TRAIN_ROUTE_IN_USE')
  assert.equal(calls.some(([name]) => name === 'route' || name === 'updateTrain'), false)
  assert.ok(calls.some(([name]) => name === 'rollback'))
})

test('prevents deactivating a train that has active bookings', async () => {
  const { service, calls } = fixture({ countActiveTrainBookings: async () => 1 })
  await assert.rejects(service.updateTrain(9, 51, {
    trainNumber: 'D-100', trainName: 'Demo', active: false,
  }), (error) => error.statusCode === 409 && error.code === 'TRAIN_HAS_ACTIVE_BOOKINGS')
  assert.equal(calls.some(([name]) => name === 'updateTrain'), false)
  assert.ok(calls.some(([name]) => name === 'rollback'))
})

test('creates schedules only for active trains and rejects malformed dates', async () => {
  const { service, calls } = fixture({ getTrain: async () => ({ trainId: 51, active: 0 }) })
  await assert.rejects(service.createSchedule(9, { trainId: 51, journeyDate: '2030-02-29' }),
    (error) => error.statusCode === 400)
  await assert.rejects(service.createSchedule(9, { trainId: 51, journeyDate: '0001-01-01' }),
    (error) => error.statusCode === 400)
  await assert.rejects(service.createSchedule(9, { trainId: 51, journeyDate: '2030-01-01' }),
    (error) => error.statusCode === 404 && error.code === 'TRAIN_NOT_FOUND')
  assert.ok(calls.some(([name]) => name === 'rollback'))
  assert.equal(calls.some(([name]) => name === 'insertSchedule'), false)
})

test('requires a configured route before creating a schedule', async () => {
  const { service, calls } = fixture({ countTrainRouteStops: async () => 1 })
  await assert.rejects(service.createSchedule(9, { trainId: 51, journeyDate: '2030-01-01' }),
    (error) => error.statusCode === 409 && error.code === 'TRAIN_ROUTE_REQUIRED')
  assert.equal(calls.some(([name]) => name === 'insertSchedule'), false)
  assert.ok(calls.some(([name]) => name === 'rollback'))
})

test('prevents schedule date changes with history and deactivation with active bookings', async () => {
  const { service, calls } = fixture({ countScheduleBookings: async (_connection, _id, activeOnly) => activeOnly ? 1 : 1 })
  await assert.rejects(service.updateSchedule(9, 61, { journeyDate: '2030-01-02', status: 'SCHEDULED' }),
    (error) => error.statusCode === 409 && error.code === 'SCHEDULE_HAS_BOOKINGS')
  await assert.rejects(service.updateSchedule(9, 61, { journeyDate: '2030-01-01', status: 'CANCELLED' }),
    (error) => error.statusCode === 409 && error.code === 'SCHEDULE_HAS_ACTIVE_BOOKINGS')
  assert.equal(calls.some(([name]) => name === 'updateSchedule'), false)
})

test('persists fares with normalized currency and rejects precision overflow', async () => {
  const { service, calls } = fixture()
  const fare = await service.saveFare(9, 61, { classType: 'sl', amount: '120.5', currency: 'inr' })
  assert.deepEqual(fare, { scheduleId: 61, classType: 'SL', amount: '120.50', currency: 'INR' })
  assert.ok(calls.some(([name, id, data]) => name === 'saveFare' && id === 61 && data.amount === '120.50'))
  await assert.rejects(service.saveFare(9, 61, { classType: 'SL', amount: '100.999', currency: 'INR' }),
    (error) => error.statusCode === 400)
})

test('adds a coach and seat inventory in the same transaction', async () => {
  const { service, calls } = fixture()
  const coach = await service.addCoach(9, 61, {
    classType: 'SL', coachNumber: 's1',
    seats: [{ seatNumber: '01', berthType: 'LOWER' }, { seatNumber: '02', berthType: 'UPPER' }],
  })
  assert.equal(coach.coachId, 71)
  assert.equal(coach.seats.length, 2)
  assert.equal(calls.filter(([name]) => name === 'insertSeat').length, 2)
  assert.ok(calls.some(([name, record]) => name === 'audit' && record.action === 'ADMIN_INVENTORY_ADDED'))
  const { service: invalidService, calls: invalidCalls } = fixture()
  await assert.rejects(invalidService.addCoach(9, 61, {
    classType: 'SL', coachNumber: 'S2', seats: [{ seatNumber: '1' }, { seatNumber: '1' }],
  }), (error) => error.statusCode === 400)
  assert.equal(invalidCalls.length, 0)
})

test('protects seats with active allocations from inventory edits', async () => {
  const { service, calls } = fixture({ countActiveSeatAllocations: async () => 1 })
  await assert.rejects(service.updateSeat(9, 81, {
    seatNumber: '01', berthType: 'LOWER', status: 'BLOCKED',
  }), (error) => error.statusCode === 409 && error.code === 'SEAT_HAS_ACTIVE_BOOKING')
  assert.equal(calls.some(([name]) => name === 'updateSeat'), false)
  assert.ok(calls.some(([name]) => name === 'rollback'))
})

test('maps duplicate master-data constraints to a safe conflict', async () => {
  const { service } = fixture({ insertSchedule: async () => { throw Object.assign(new Error('private duplicate details'), { code: 'ER_DUP_ENTRY' }) } })
  await assert.rejects(service.createSchedule(9, { trainId: 51, journeyDate: '2030-01-01' }),
    (error) => error.statusCode === 409 && error.code === 'DUPLICATE_MASTER_DATA' && !error.message.includes('private'))
})
