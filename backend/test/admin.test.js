import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAdminService } from '../src/admin/adminService.js'

test('admin command validation rejects malformed input before database access', async () => {
  let connected = false
  const admin = createAdminService({
    async getConnection() { connected = true },
    async execute() { connected = true; return [[]] },
  }, { today: () => '2030-01-01' })
  await assert.rejects(admin.createTrain({ trainNumber: 'x!', trainName: 'x' }, 1), (error) => error.status === 400)
  await assert.rejects(admin.updateRoute(1, { stops: [{ stationCode: 'DMB', departureTime: '08:00' }] }, 1), (error) => error.code === 'INVALID_ROUTE')
  await assert.rejects(admin.createSchedule({ trainId: 1, journeyDate: '2030-02-30', classes: [{ classType: 'CC', fare: 2 }], inventory: [{ classType: 'CC', coachNumber: 'D1', seats: [{ seatNumber: '1A' }] }] }, 1), (error) => error.code === 'INVALID_DATE')
  await assert.rejects(admin.updateSchedule(1, { inventory: { deactivateSeatIds: '1' } }, 1), (error) => error.code === 'INVALID_SEAT')
  assert.equal(connected, false)
})

test('admin inventory deactivation requires a valid inventory change request', async () => {
  const admin = createAdminService({ async getConnection() { throw new Error('should not connect') } })
  await assert.rejects(admin.updateSchedule(1, { inventory: { deactivateSeatIds: [0, 0] } }, 1), (error) => error.code === 'INVALID_SEAT')
  await assert.rejects(admin.updateSchedule(1, {}, 1), (error) => error.code === 'EMPTY_UPDATE')
})
