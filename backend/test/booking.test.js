const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createBookingService } = require('../src/services/bookingService')

const validRequest = {
  scheduleId: 4,
  source: 'DMB',
  destination: 'DMC',
  classType: 'CC',
  seatIds: [8],
  passengers: [{ name: 'Pat Passenger', age: 30, gender: 'OTHER' }],
}

function fixture({
  paymentSuccess = true,
  failOn,
  seatAvailable = true,
  seatRows,
  pnrFactory = () => 'PNR2345678AB',
  pnrCollisionCount = 0,
  pnrCollisionMessage = "Duplicate entry for key 'uq_bookings_pnr'",
} = {}) {
  const statements = []
  const allocations = []
  let id = 20

  const connection = {
    async beginTransaction() { statements.push('BEGIN') },
    async commit() { statements.push('COMMIT') },
    async rollback() { statements.push('ROLLBACK') },
    release() { statements.push('RELEASE') },
    async execute(sql, params) {
      statements.push(sql)

      if (/UPDATE\s+bookings\s+SET\s+pnr/i.test(sql) && pnrCollisionCount > 0) {
        pnrCollisionCount -= 1
        const error = new Error(pnrCollisionMessage)
        error.code = 'ER_DUP_ENTRY'
        throw error
      }

      if (failOn && sql.replace(/\s+/g, ' ').includes(failOn.replace(/\s+/g, ' '))) {
        throw new Error(`failure at ${failOn}`)
      }

      if (sql.includes('JOIN route_stops os')) {
        return [[{
          originStationId: 1,
          destinationStationId: 2,
          originDayOffset: 0,
          originCode: 'DMB',
          originName: 'Demo Bengaluru',
          destinationCode: 'DMC',
          destinationName: 'Demo Chennai',
        }]]
      }

      if (sql.includes('FROM schedules sc')) {
        return [[{
          scheduleId: 4,
          journeyDate: '2030-05-12',
          scheduleStatus: 'SCHEDULED',
          trainNumber: 'D-100',
          trainName: 'Demo Coastal Express',
          fare: '450.00',
          currency: 'INR',
        }]]
      }

      if (sql.includes('FROM seats s')) {
        return seatRows
          ? [seatRows]
          : [[{
              seatId: 8,
              seatNumber: '1A',
              status: 'AVAILABLE',
              classType: 'CC',
              scheduleId: 4,
              activeAllocation: seatAvailable ? 0 : 1,
            }]]
      }

      if (sql.includes('INSERT INTO booking_seats')) allocations.push(params)
      if (sql.includes('INSERT INTO bookings')) return [{ insertId: 31 }]
      if (sql.includes('INSERT INTO passengers')) return [{ insertId: id++ }]
      if (sql.includes('INSERT INTO payments')) return [{ insertId: id++ }]

      return [{ affectedRows: 1 }]
    },
  }

  const simulator = {
    async charge() {
      return { success: paymentSuccess }
    },
  }

  const service = createBookingService(
    { async getConnection() { return connection } },
    simulator,
    { today: () => '2030-01-01', pnrFactory },
  )

  return { service, statements, allocations }
}

test('successful simulated payment confirms booking, allocations and payment in one transaction', async () => {
  const { service, statements } = fixture()
  const booking = await service.create(12, validRequest)
  assert.equal(booking.status, 'CONFIRMED')
  assert.equal(booking.pnr, 'PNR2345678AB')
  assert.equal(booking.totalFare, '450.00')
  assert.equal(booking.passengers[0].seatNumber, '1A')
  assert.ok(statements.some((sql) =>
  /UPDATE\s+bookings\s+SET\s+pnr\s*=\s*\?,\s*status\s*=\s*'CONFIRMED'/i.test(sql)
))
  assert.ok(statements.some((sql) => sql.includes("UPDATE booking_seats SET allocation_status = 'CONFIRMED'")))
  assert.ok(statements.some((sql) => sql.includes("UPDATE payments SET status = 'SUCCESS'")))
  assert.ok(statements.indexOf('COMMIT') > statements.findIndex((sql) => sql.includes("UPDATE payments SET status = 'SUCCESS'")))
  assert.equal(statements.some((sql) => sql.includes('UPDATE seats')), false)
})

function cancellationFixture({
  status = 'CONFIRMED',
  ownerId = 12,
  allocationStatuses = ['CONFIRMED'],
  failOn,
} = {}) {
  const statements = []
  let bookingStatus = status
  let allocations = allocationStatuses.map((allocationStatus, index) => ({
    bookingSeatId: index + 1,
    status: allocationStatus,
  }))
  let committed = false
  let snapshot

  const connection = {
    async beginTransaction() {
      statements.push('BEGIN')
      snapshot = {
        bookingStatus,
        allocations: allocations.map((row) => ({ ...row })),
      }
    },
    async commit() {
      statements.push('COMMIT')
      committed = true
    },
    async rollback() {
      statements.push('ROLLBACK')
      bookingStatus = snapshot.bookingStatus
      allocations = snapshot.allocations
    },
    release() {
      statements.push('RELEASE')
    },
    async execute(sql, params) {
      statements.push(sql)

      if (failOn && sql.includes(failOn)) {
        throw new Error(`forced failure at ${failOn}`)
      }

      if (sql.includes('FROM bookings')) {
        return [[{
          bookingId: Number(params[0]),
          userId: ownerId,
          scheduleId: 4,
          status: bookingStatus,
          classType: 'SL',
          totalFare: '1000.00',
          originStationId: 1,
          journeyDate: '2026-12-10',
          departureTime: '12:00:00',
          dayOffset: 0,
          passengerCount: 1,
        }]]
      }
      if (sql.includes('COUNT(*) AS passengerCount')) {
  return [[{ passengerCount: 1 }]]
}
      if (sql.includes('FROM payments')) {
        return [[{ amount: '1000.00' }]]
      }

      if (sql.includes('FROM schedules')) {
        return [[{ scheduleId: 4 }]]
      }

      if (sql.includes('FROM booking_seats')) {
        return [allocations.filter((row) =>
          ['HELD', 'CONFIRMED'].includes(row.status),
        )]
      }

      if (sql.includes("SET status = 'CANCELLED'")) {
        bookingStatus = 'CANCELLED'
        return [{ affectedRows: 1 }]
      }

      if (sql.includes("SET allocation_status = 'RELEASED'")) {
        const active = allocations.filter((row) =>
          ['HELD', 'CONFIRMED'].includes(row.status),
        )
        active.forEach((row) => {
          row.status = 'RELEASED'
        })
        return [{ affectedRows: active.length }]
      }

      if (sql.includes('INSERT INTO cancellations')) {
        return [{ insertId: 99 }]
      }

      return [{ affectedRows: 1 }]
    },
  }

  const service = createBookingService(
    { async getConnection() { return connection } },
    {},
    {},
  )

  return {
    service,
    statements,
    get state() {
      return {
        bookingStatus,
        allocations: allocations.map((row) => ({ ...row })),
        committed,
      }
    },
  }
}


test('cancels an owned confirmed booking and releases every active allocation atomically', async () => {
  const fixtureResult = cancellationFixture({
    allocationStatuses: ['CONFIRMED', 'HELD', 'RELEASED'],
  })
  const cancellation = await fixtureResult.service.cancel(12, '31')

  assert.deepEqual(cancellation, {
  cancellationId: 99,
  bookingId: 31,
  status: 'CANCELLED',
  releasedSeatCount: 2,
  refundAmount: 880,
  refundStatus: 'PENDING',
  currency: 'INR',
})
  assert.equal(fixtureResult.state.bookingStatus, 'CANCELLED')
  assert.deepEqual(fixtureResult.state.allocations.map((allocation) => allocation.status), ['RELEASED', 'RELEASED', 'RELEASED'])
  assert.equal(fixtureResult.state.committed, true)
  assert.ok(fixtureResult.statements.some((sql) => sql.includes('INSERT INTO cancellations')))
  const auditIndex = fixtureResult.statements.findIndex((sql) => sql.includes('INSERT INTO audit_logs'))
  assert.ok(auditIndex >= 0)
  assert.ok(fixtureResult.statements.indexOf('COMMIT') > auditIndex)
})

test('cancellation validates booking IDs before opening a transaction', async () => {
  const service = createBookingService({
    async getConnection() { throw new Error('connection must not be opened') },
  }, {}, {})

  await assert.rejects(service.cancel(12, '0'), { statusCode: 400, code: 'VALIDATION_ERROR' })
  await assert.rejects(service.cancel(12, '1.5'), { statusCode: 400, code: 'VALIDATION_ERROR' })
})

test('cancellation returns not found for another passenger booking without modifying it', async () => {
  const fixtureResult = cancellationFixture({ ownerId: 99 })
  await assert.rejects(fixtureResult.service.cancel(12, 31), {
    statusCode: 404,
    code: 'BOOKING_NOT_FOUND',
  })
  assert.equal(fixtureResult.state.bookingStatus, 'CONFIRMED')
  assert.equal(fixtureResult.state.committed, false)
  assert.ok(fixtureResult.statements.includes('ROLLBACK'))
  assert.equal(fixtureResult.statements.some((sql) => sql.includes("SET status = 'CANCELLED'")), false)
})

test('cancellation rejects ineligible and already-cancelled bookings without side effects', async () => {
  for (const status of ['PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED']) {
    const fixtureResult = cancellationFixture({ status })
    await assert.rejects(fixtureResult.service.cancel(12, 31), {
      statusCode: 409,
      code: 'BOOKING_NOT_CANCELLABLE',
    })
    assert.equal(fixtureResult.state.bookingStatus, status)
    assert.equal(fixtureResult.state.committed, false)
    assert.equal(fixtureResult.statements.some((sql) => sql.includes("SET status = 'CANCELLED'")), false)
  }
})

test('a repeated cancellation cannot process a booking twice', async () => {
  const fixtureResult = cancellationFixture()
  await fixtureResult.service.cancel(12, 31)
  await assert.rejects(fixtureResult.service.cancel(12, 31), {
    statusCode: 409,
    code: 'BOOKING_NOT_CANCELLABLE',
  })
  assert.equal(fixtureResult.statements.filter((sql) => sql.includes('INSERT INTO cancellations')).length, 1)
})

test('cancellation rolls back booking changes when seat release fails', async () => {
  const fixtureResult = cancellationFixture({ failOn: "SET allocation_status = 'RELEASED'" })
  await assert.rejects(fixtureResult.service.cancel(12, 31), /forced failure/)
  assert.equal(fixtureResult.state.bookingStatus, 'CONFIRMED')
  assert.equal(fixtureResult.state.allocations[0].status, 'CONFIRMED')
  assert.equal(fixtureResult.state.committed, false)
  assert.ok(fixtureResult.statements.includes('ROLLBACK'))
})

test('keeps selected seat order paired with the matching passenger', async () => {
  const { service, allocations } = fixture({
    seatRows: [
      { seatId: 8, seatNumber: '1A', status: 'AVAILABLE', classType: 'CC', scheduleId: 4, activeAllocation: 0 },
      { seatId: 9, seatNumber: '1B', status: 'AVAILABLE', classType: 'CC', scheduleId: 4, activeAllocation: 0 },
    ],
  })
  const booking = await service.create(12, {
    ...validRequest,
    seatIds: [9, 8],
    passengers: [
      { name: 'Passenger One', age: 34, gender: 'OTHER' },
      { name: 'Passenger Two', age: 31, gender: 'OTHER' },
    ],
  })

  assert.deepEqual(allocations.map(([, seatId, passengerId]) => [seatId, passengerId]), [[9, 20], [8, 21]])
  assert.deepEqual(booking.passengers.map(({ seatNumber }) => seatNumber), ['1B', '1A'])
})
test('retries a duplicate PNR and confirms booking with a new PNR', async () => {
  const pnrs = ['PNR2345678AB', 'PNR3456789CD']
  let calls = 0

  const { service, statements } = fixture({
    pnrFactory: () => pnrs[calls++],
    pnrCollisionCount: 1,
  })

  const booking = await service.create(12, validRequest)

  assert.equal(calls, 2)
  assert.equal(booking.pnr, 'PNR3456789CD')
  assert.equal(booking.status, 'CONFIRMED')
  assert.equal(
    statements.filter((sql) => /UPDATE\s+bookings\s+SET\s+pnr/i.test(sql)).length,
    2,
  )
  assert.ok(statements.includes('COMMIT'))
  assert.equal(statements.includes('ROLLBACK'), false)
})

test('does not retry unrelated duplicate-key errors', async () => {
  let calls = 0

  const { service, statements } = fixture({
    pnrFactory: () => {
      calls += 1
      return 'PNR2345678AB'
    },
    pnrCollisionCount: 1,
    pnrCollisionMessage: "Duplicate entry for key 'uq_other_unique'",
  })

  await assert.rejects(
    service.create(12, validRequest),
    (error) => error.code === 'ER_DUP_ENTRY',
  )

  assert.equal(calls, 1)
  assert.ok(statements.includes('ROLLBACK'))
  assert.equal(statements.includes('COMMIT'), false)
})
test('failed payment retains failed status without PNR and releases held allocations', async () => {
  const { service, statements } = fixture({ paymentSuccess: false })
  await assert.rejects(service.create(12, validRequest), (error) => error.statusCode === 402 && error.code === 'PAYMENT_FAILED')
  assert.ok(statements.some((sql) => sql.includes("UPDATE bookings SET status = 'PAYMENT_FAILED'")))
  assert.ok(statements.some((sql) =>
  /UPDATE\s+booking_seats\s+SET\s+allocation_status\s*=\s*'RELEASED'/i.test(sql)
))
  assert.ok(statements.some((sql) => sql.includes("UPDATE payments SET status = 'FAILED'")))
  assert.equal(statements.some((sql) => sql.includes("status = 'CONFIRMED'")), false)
  assert.equal(statements.some((sql) => sql.includes('UPDATE bookings SET pnr')), false)
  assert.ok(statements.some((sql) => sql === 'COMMIT'))
})

test('invalid passenger values are reported by index before acquiring a connection', async () => {
  let connected = false
  const service = createBookingService({ async getConnection() { connected = true } }, { async charge() {} })
  await assert.rejects(
    service.create(12, { ...validRequest, passengers: [null, { name: 'Asha@', age: -1, gender: 'X' }] }),
    (error) => Boolean(error.statusCode === 400
      && error.details['passengers.0.passenger']
      && error.details['passengers.1.name']
      && error.details['passengers.1.age']
      && error.details['passengers.1.gender']),
  )
  assert.equal(connected, false)
})

test('rejects each required passenger field and malformed passenger collection', async () => {
  const invalidPassengers = [
    undefined,
    null,
    [],
    'passenger',
    {},
    { name: 'Asha Rao' },
    { name: 'Asha Rao', age: 25 },
    { name: 'Asha Rao', age: 25, gender: 'X' },
    { name: '', age: 25, gender: 'FEMALE' },
    { name: 'A'.repeat(121), age: 25, gender: 'FEMALE' },
    { name: 'Asha_1', age: 25, gender: 'FEMALE' },
    ...[0, -1, 121, 'abc', 2.5].map((age) => ({ name: 'Asha Rao', age, gender: 'FEMALE' })),
  ]
  for (const passenger of invalidPassengers) {
    const { service } = fixture()
    await assert.rejects(service.create(12, { ...validRequest, passengers: [passenger] }), (error) => error.statusCode === 400)
  }
  const { service } = fixture()
  await assert.rejects(service.create(12, { ...validRequest, passengers: [validRequest.passengers[0], { name: '', age: 20, gender: 'OTHER' }] }),
    (error) => Boolean(error.details['passengers.1.name']))
})

test('rejects malformed requests, invalid route identifiers and duplicate seats', async () => {
  const { service } = fixture()
  for (const input of [null, [], { ...validRequest, scheduleId: '1; DROP TABLE seats' },
    { ...validRequest, seatIds: [8, 8], passengers: [validRequest.passengers[0], validRequest.passengers[0]] }]) {
    await assert.rejects(service.create(12, input), (error) => error.statusCode === 400)
  }
})

test('unavailable active allocations are rejected before a booking or payment is inserted', async () => {
  const { service, statements } = fixture({ seatAvailable: false })
  await assert.rejects(service.create(12, validRequest), (error) => error.statusCode === 409 && error.code === 'SEATS_UNAVAILABLE')
  assert.equal(statements.some((sql) => sql.includes('INSERT INTO bookings')), false)
  assert.ok(statements.some((sql) => sql === 'ROLLBACK'))
})

test('database failures during passenger, seat, payment or confirmation writes roll back', async (context) => {
  for (const failOn of ['INSERT INTO bookings', 'INSERT INTO passengers', 'INSERT INTO booking_seats', 'INSERT INTO payments', "UPDATE bookings SET pnr", "UPDATE payments SET status = 'SUCCESS'"]) {
    await context.test(failOn, async () => {
      const { service, statements } = fixture({ failOn })
      await assert.rejects(service.create(12, validRequest), new RegExp(`failure at ${failOn.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
      assert.ok(statements.some((sql) => sql === 'ROLLBACK'))
      assert.equal(statements.some((sql) => sql === 'COMMIT'), false)
    })
  }
})
