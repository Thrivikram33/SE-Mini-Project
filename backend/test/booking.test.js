import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBookingService } from '../src/bookings/bookingService.js'
import { createPaymentSimulator } from '../src/bookings/paymentSimulator.js'

function fixture({ seatStatus = 'AVAILABLE', paymentSuccess = true } = {}) {
  const statements = []
  let nextId = 20
  const connection = {
    async beginTransaction() { statements.push('BEGIN') },
    async commit() { statements.push('COMMIT') },
    async rollback() { statements.push('ROLLBACK') },
    release() { statements.push('RELEASE') },
    async execute(sql, params) {
      statements.push(sql)
      if (sql.includes('FROM schedules sch')) return [[{
        scheduleId: 4, journeyDate: '2030-05-12', scheduleStatus: 'SCHEDULED',
        trainNumber: 'D-100', trainName: 'Demo Coastal Express', fare: '450.00',
      }]]
      if (sql.includes('FROM route_stops origin_stop')) return [[{
        originStationId: 1, destinationStationId: 2, originCode: 'DMB', originName: 'Demo Station Bengaluru',
        destinationCode: 'DMC', destinationName: 'Demo Station Chennai',
      }]]
      if (sql.includes('FROM seats se')) return [[{
        seatId: 8, seatNumber: '1A', status: seatStatus, classType: 'CC', scheduleId: 4,
      }]]
      if (sql.includes('INSERT INTO bookings')) return [{ insertId: 31 }]
      if (sql.includes('INSERT INTO passengers')) return [{ insertId: nextId++ }]
      if (sql.includes('SELECT pnr FROM bookings')) return [[{ pnr: params[0] === 31 ? 'PNR2345678' : 'PNR2345678' }]]
      if (sql.includes('UPDATE seats')) return [{ affectedRows: 1 }]
      return [{ affectedRows: 1 }]
    },
  }
  const db = { async getConnection() { return connection } }
  const simulator = {
    async charge() { return { success: paymentSuccess } },
  }
  const service = createBookingService(db, simulator, { today: () => '2030-01-01', pnrFactory: () => 'PNR2345678' })
  return { service, statements }
}

const request = { scheduleId: 4, source: 'DMB', destination: 'DMC', classType: 'cc', seatIds: [8], passengers: [{ name: 'Pat Passenger', age: 34, gender: 'X' }] }

test('successful simulated payment commits unique PNR and seat allocation together', async () => {
  const { service, statements } = fixture()
  const booking = await service.create(12, request)
  assert.equal(booking.pnr, 'PNR2345678')
  assert.equal(booking.status, 'CONFIRMED')
  assert.equal(booking.totalFare, 450)
  assert.equal(booking.passengers[0].seatNumber, '1A')
  assert.ok(statements.some((sql) => sql.includes("UPDATE seats SET status = 'BOOKED'")))
  assert.ok(statements.indexOf('COMMIT') > statements.findIndex((sql) => sql.includes('UPDATE seats')))
  assert.equal(statements.includes('ROLLBACK'), false)
  assert.ok(
    statements.some((sql) => sql.includes('INSERT INTO passengers')),
    'Passenger details should be saved',
  )
  assert.ok(
    statements.some((sql) => sql.includes('INSERT INTO booking_seats')),
    'The seat should be linked to the booking',
  )
  assert.ok(
    statements.some(
      (sql) => sql.includes('INSERT INTO payments') && sql.includes("'SUCCESS'"),
    ),
    'A successful payment record should be written',
  )
  assert.ok(
    statements.indexOf('COMMIT') >
      statements.findIndex(
        (sql) => sql.includes('INSERT INTO payments') && sql.includes("'SUCCESS'"),
      ),
    'The transaction should commit after the successful payment record',
  )
})

test('failed simulated payment records failure but does not consume a seat or return a PNR', async () => {
  const statements = []
  let failedBookingWritten = false
  const connection = {
    async beginTransaction() {}, async commit() { statements.push('COMMIT') },
    async rollback() { statements.push('ROLLBACK') }, release() {},
    async execute(sql) {
      statements.push(sql)
      if (sql.includes('FROM schedules sch')) return [[{ journeyDate: '2030-05-12', scheduleStatus: 'SCHEDULED', trainNumber: 'D-100', trainName: 'Demo', fare: '450.00' }]]
      if (sql.includes('FROM route_stops origin_stop')) return [[{ originStationId: 1, destinationStationId: 2, originCode: 'DMB', originName: 'Demo Station Bengaluru', destinationCode: 'DMC', destinationName: 'Demo Station Chennai' }]]
      if (sql.includes('FROM seats se')) return [[{ seatId: 8, seatNumber: '1A', status: 'AVAILABLE', classType: 'CC', scheduleId: 4 }]]
      if (sql.includes('INSERT INTO bookings')) {
        failedBookingWritten = true;

        assert.match(sql, /VALUES\s*\(\s*NULL/i);
        assert.match(sql, /'PAYMENT_FAILED'/);

        return [{ insertId: 32 }];
    }
    },
  }
  const service = createBookingService({ async getConnection() { return connection } }, createPaymentSimulator({ nodeEnv: 'development' }), { today: () => '2030-01-01' })
  await assert.rejects(service.create(12, { ...request, paymentOutcome: 'failure' }), (error) => error.status === 402 && error.code === 'PAYMENT_FAILED')
  assert.equal(failedBookingWritten, true)
  assert.ok(
    statements.some((sql) => sql.includes('INSERT INTO payments')),
    'A failed payment record should be written',
  );
  assert.ok(statements.includes('COMMIT'))
  assert.equal(statements.some((sql) => sql.includes('UPDATE seats')), false)
  assert.equal(statements.some((sql) => sql.includes('INSERT INTO booking_seats')), false)
})

test('unavailable seat aborts the transaction before simulated payment', async () => {
  const { service, statements } = fixture({ seatStatus: 'BOOKED' })
  await assert.rejects(service.create(12, request), (error) => error.status === 409 && error.code === 'SEATS_UNAVAILABLE')
  assert.ok(statements.includes('ROLLBACK'))
  assert.equal(statements.some((sql) => sql.includes('INSERT INTO bookings')), false)
})

test('invalid passenger data fails before opening a database transaction', async () => {
  let connected = false
  const service = createBookingService({ async getConnection() { connected = true } }, createPaymentSimulator({ nodeEnv: 'development' }))
  await assert.rejects(service.create(12, { ...request, passengers: [{ name: '', age: 150 }] }), (error) => error.status === 400)
  assert.equal(connected, false)
})

test('database failure during passenger insertion rolls back booking transaction and releases connection', async () => {
  const statements = []
  let released = false

  const connection = {
    async beginTransaction() {
      statements.push('BEGIN')
    },
    async commit() {
      statements.push('COMMIT')
    },
    async rollback() {
      statements.push('ROLLBACK')
    },
    release() {
      released = true
    },
    async execute(sql) {
      statements.push(sql)

      if (sql.includes('FROM schedules sch')) {
        return [[{
          scheduleId: 4,
          journeyDate: '2030-05-12',
          scheduleStatus: 'SCHEDULED',
          trainNumber: 'D-100',
          trainName: 'Demo Coastal Express',
          fare: '450.00',
        }]]
      }

      if (sql.includes('FROM route_stops origin_stop')) {
        return [[{
          originStationId: 1,
          destinationStationId: 2,
          originCode: 'DMB',
          originName: 'Demo Station Bengaluru',
          destinationCode: 'DMC',
          destinationName: 'Demo Station Chennai',
        }]]
      }

      if (sql.includes('FROM seats se')) {
        return [[{
          seatId: 8,
          seatNumber: '1A',
          status: 'AVAILABLE',
          classType: 'CC',
          scheduleId: 4,
        }]]
      }

      if (sql.includes('INSERT INTO bookings')) {
        return [{ insertId: 31 }]
      }

      if (sql.includes('INSERT INTO passengers')) {
        throw new Error('Simulated passenger insert failure')
      }

      return [{ affectedRows: 1 }]
    },
  }

  const service = createBookingService(
    { async getConnection() { return connection } },
    { async charge() { return { success: true } } },
    {
      today: () => '2030-01-01',
      pnrFactory: () => 'PNR2345678',
    },
  )

  await assert.rejects(
    service.create(12, request),
    /Simulated passenger insert failure/,
  )

  assert.ok(statements.includes('BEGIN'))
  assert.ok(statements.includes('ROLLBACK'))
  assert.equal(statements.includes('COMMIT'), false)
  assert.equal(released, true)
})
