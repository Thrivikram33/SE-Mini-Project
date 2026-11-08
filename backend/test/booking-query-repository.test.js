const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createBookingQueryRepository } = require('../src/repositories/bookingQueryRepository')
const { createBookingService } = require('../src/services/bookingService')

test('booking history query filters by owner and maps ticket summary fields', async () => {
  const calls = []
  const repository = createBookingQueryRepository({
    async execute(sql, params) {
      calls.push({ sql, params })
      return [[{
        bookingId: '18', pnr: 'PNR2345678AB', status: 'CONFIRMED', totalFare: '450.00',
        originCode: 'DMB', originName: 'Demo Bengaluru', destinationCode: 'DMC',
        destinationName: 'Demo Chennai',
      }]]
    },
  })
  const bookings = await repository.listForPassenger(7)
  assert.deepEqual(calls[0].params, [7])
  assert.match(calls[0].sql, /WHERE b\.user_id = \?/)
  assert.equal(bookings[0].bookingId, 18)
  assert.deepEqual(bookings[0].origin, { code: 'DMB', name: 'Demo Bengaluru' })
  assert.deepEqual(bookings[0].destination, { code: 'DMC', name: 'Demo Chennai' })
})

test('PNR lookup applies owner scope and returns passenger seat details', async () => {
  const calls = []
  const repository = createBookingQueryRepository({
    async execute(sql, params) {
      calls.push({ sql, params })
      if (/WHERE b\.pnr/.test(sql)) return [[{
        bookingId: '18', pnr: 'PNR2345678AB', status: 'CONFIRMED', totalFare: '450.00',
      }]]
      return [[{ passengerId: 25, name: 'Asha Rao', age: 25, gender: 'FEMALE', seatNumber: '1A' }]]
    },
  })
  const booking = await repository.findPassengerBookingByPnr('PNR2345678AB', 7)
  assert.deepEqual(calls[0].params, ['PNR2345678AB', 7])
  assert.match(calls[0].sql, /WHERE b\.pnr = \? AND b\.user_id = \?/)
  assert.deepEqual(calls[1].params, [18])
  assert.deepEqual(booking.passengers, [{ passengerId: 25, name: 'Asha Rao', age: 25, gender: 'FEMALE', seatNumber: '1A' }])
})

test('PNR lookup returns null without querying passengers when owner-scoped booking is absent', async () => {
  let calls = 0
  const repository = createBookingQueryRepository({ async execute() { calls += 1; return [[]] } })
  assert.equal(await repository.findPassengerBookingByPnr('PNR2345678AB', 99), null)
  assert.equal(calls, 1)
})

test('service normalizes PNR and hides malformed and other-owner lookups behind one 404', async () => {
  const lookups = []
  const service = createBookingService({ async execute(sql, params) {
    lookups.push(params)
    return [[]]
  } }, { async charge() {} })
  await assert.rejects(service.getPassengerBookingByPnr(7, 'bad'), (error) => error.statusCode === 404 && error.code === 'BOOKING_NOT_FOUND')
  await assert.rejects(service.getPassengerBookingByPnr(7, 'pnr2345678ab'), (error) => error.statusCode === 404 && error.code === 'BOOKING_NOT_FOUND')
  assert.deepEqual(lookups, [['PNR2345678AB', 7]])
})
