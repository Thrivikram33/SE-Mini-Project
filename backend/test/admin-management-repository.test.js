const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createAdminManagementRepository } = require('../src/repositories/adminManagementRepository')

test('train listing binds no user data and aggregates ordered route stop fields', async () => {
  const repository = createAdminManagementRepository({
    async execute(sql, params) {
      assert.equal(params, undefined)
      assert.match(sql, /ORDER BY t\.train_number, rs\.sequence_no/)
      return [[
        { trainId: '5', trainNumber: 'T-5', trainName: 'Test Train', active: 1, sequenceNo: 1, stationCode: 'AAA', stationName: 'Alpha', arrivalTime: null, departureTime: '09:00:00', dayOffset: 0 },
        { trainId: '5', trainNumber: 'T-5', trainName: 'Test Train', active: 1, sequenceNo: 2, stationCode: 'BBB', stationName: 'Beta', arrivalTime: '10:00:00', departureTime: null, dayOffset: 0 },
      ]]
    },
  })
  const [train] = await repository.listTrains()
  assert.equal(train.trainId, 5)
  assert.equal(train.active, true)
  assert.deepEqual(train.routeStops.map((stop) => stop.stationCode), ['AAA', 'BBB'])
  assert.equal(train.routeStops[1].arrivalTime, '10:00:00')
})

test('schedule list maps numeric inventory counts and remains deterministic', async () => {
  const repository = createAdminManagementRepository({
    async execute(sql) {
      assert.match(sql, /ORDER BY s\.journey_date DESC, s\.schedule_id DESC/)
      return [[{ scheduleId: '20', trainId: '7', coachCount: '2', seatCount: '96', status: 'SCHEDULED' }]]
    },
  })
  const [schedule] = await repository.listSchedules()
  assert.deepEqual([schedule.scheduleId, schedule.trainId, schedule.coachCount, schedule.seatCount], [20, 7, 2, 96])
})

test('fare and seat writes use placeholders for user-controlled values', async () => {
  const calls = []
  const repositoryConnection = {
    async execute(sql, params) { calls.push({ sql, params }); return [{ affectedRows: 1 }] },
  }
  const repository = createAdminManagementRepository(repositoryConnection)
  await repository.saveFare(repositoryConnection, 4, {
    classType: 'SL', amount: '12.50', currency: 'INR',
  })
  await repository.updateSeat(repositoryConnection, 9, {
    seatNumber: '01', berthType: 'LOWER', status: 'BLOCKED',
  })
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].params, [4, 'SL', '12.50', 'INR'])
  assert.match(calls[0].sql, /VALUES \(\?, \?, \?, \?\)/)
  assert.deepEqual(calls[1].params, ['01', 'LOWER', 'BLOCKED', 9])
  assert.match(calls[1].sql, /WHERE seat_id = \?/)
})
