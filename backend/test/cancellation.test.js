import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateRefund, createCancellationService } from '../src/bookings/cancellationService.js'
import { ApiError } from '../src/shared/apiError.js'

function fixture({ status = 'CONFIRMED', owner = 5, seatReleaseCount = 1, refundSuccess = true } = {}) {
  const statements = []
  const connection = {
    async beginTransaction() { statements.push('BEGIN') },
    async commit() { statements.push('COMMIT') },
    async rollback() { statements.push('ROLLBACK') },
    release() { statements.push('RELEASE') },
    async execute(sql) {
      statements.push(sql)
      if (sql.includes('FROM bookings b JOIN schedules')) return [[{
        bookingId: 6, userId: owner, status, totalFare: '1000.00', journeyDate: '2030-05-12',
      }]]
      if (sql.includes('FROM booking_seats bs')) return [[{ seatId: 8 }]]
      if (sql.includes("SET allocation_status = 'RELEASED'")) return [{ affectedRows: 1 }]
      if (sql.includes("SET status = 'AVAILABLE'")) return [{ affectedRows: seatReleaseCount }]
      return [{ affectedRows: 1 }]
    },
  }
  const service = createCancellationService(
    { async getConnection() { return connection } },
    { async refund() { return { success: refundSuccess } } },
    { refundPercent: 80, today: () => '2030-01-01' },
  )
  return { service, statements }
}

test('refund is rounded to cents according to configured percentage', () => {
  assert.equal(calculateRefund(1000, 80), 800)
  assert.equal(calculateRefund(19.99, 75), 14.99)
})

test('valid cancellation records refund and releases seats within one transaction', async () => {
  const { service, statements } = fixture()
  const result = await service.cancel(5, 'PNR2345678', { confirm: true })
  assert.equal(result.status, 'CANCELLED')
  assert.equal(result.refundAmount, 800)
  assert.deepEqual(result.releasedSeatIds, [8])
  assert.ok(statements.some((sql) => sql.includes("SET allocation_status = 'RELEASED'")))
  assert.ok(statements.some((sql) => sql.includes("SET status = 'AVAILABLE'")))
  assert.ok(statements.includes('COMMIT'))
  assert.equal(statements.includes('ROLLBACK'), false)
})

test('cancellation requires explicit confirmation and enforces booking ownership', async () => {
  let connections = 0
  const noConnection = createCancellationService({ async getConnection() { connections += 1 } }, { async refund() {} })
  await assert.rejects(noConnection.cancel(5, 'PNR2345678', { confirm: false }), (error) => error.code === 'CONFIRMATION_REQUIRED')
  assert.equal(connections, 0)
  const { service, statements } = fixture({ owner: 9 })
  await assert.rejects(service.cancel(5, 'PNR2345678', { confirm: true }), (error) => error.status === 403)
  assert.ok(statements.includes('ROLLBACK'))
  assert.equal(statements.some((sql) => sql.includes("SET status = 'AVAILABLE'")), false)
})

test('ineligible or repeated cancellation is rejected without releasing seats', async () => {
  const { service, statements } = fixture({ status: 'CANCELLED' })
  await assert.rejects(service.cancel(5, 'PNR2345678', { confirm: true }), (error) => error instanceof ApiError && error.status === 409)
  assert.equal(statements.some((sql) => sql.includes("SET status = 'AVAILABLE'")), false)
})

test('seat release conflict rolls back the cancellation', async () => {
  const { service, statements } = fixture({ seatReleaseCount: 0 })
  await assert.rejects(service.cancel(5, 'PNR2345678', { confirm: true }), (error) => error.code === 'SEAT_RELEASE_CONFLICT')
  assert.ok(statements.includes('ROLLBACK'))
  assert.equal(statements.some((sql) => sql.includes("UPDATE bookings SET status = 'CANCELLED'")), false)
})
