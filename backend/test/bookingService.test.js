const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const servicePath = path.resolve(__dirname, '../src/services/bookingService.js')
const originalLoad = Module._load
let queryBehavior
let connectionBehavior

Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === servicePath && request === '../config/db') {
    return {
      execute: (...args) => queryBehavior(...args),
      getConnection: async () => ({
        execute: (...args) => connectionBehavior(...args),
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
      }),
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let bookingService
try {
  bookingService = require(servicePath)
} finally {
  Module._load = originalLoad
}

function installMock({ select = [], insert = [], updates = [] } = {}) {
  const calls = []
  queryBehavior = async (sql, params) => {
    calls.push({ sql, params })
    const sqlText = String(sql)
    if (sqlText.includes('FROM schedules')) return [[{ scheduleId: 42, status: 'SCHEDULED' }]]
    if (sqlText.includes('FROM users')) return [[{ userId: 7 }]]
    if (sqlText.includes('FROM fares')) return [[{ amount: 120.5, currency: 'INR' }]]
    if (sqlText.includes('FROM seats')) return [[{ seatId: 101, seatStatus: 'AVAILABLE', classType: 'SL', scheduleId: 42 }]]
    if (sqlText.includes('FROM booking_seats') && sqlText.includes('allocation_status IN')) return [[]]
    if (sqlText.includes('INSERT INTO bookings')) return [{ insertId: 500 }]
    if (sqlText.includes('INSERT INTO passengers')) return [{ insertId: 600 }]
    if (sqlText.includes('INSERT INTO booking_seats')) return [{ insertId: 700 }]
    if (sqlText.includes('UPDATE booking_seats')) return [{ affectedRows: 1 }]
    if (sqlText.includes('UPDATE bookings')) return [{ affectedRows: 1 }]
    return select.length ? select : [[]]
  }

  connectionBehavior = async (sql, params) => {
    const sqlText = String(sql)
    if (sqlText.includes('FROM schedules')) return [[{ scheduleId: 42, status: 'SCHEDULED' }]]
    if (sqlText.includes('FROM users')) return [[{ userId: 7 }]]
    if (sqlText.includes('FROM fares')) return [[{ amount: 120.5, currency: 'INR' }]]
    if (sqlText.includes('SELECT s.seat_id AS seatId')) return [[{ seatId: 101, seatStatus: 'AVAILABLE', classType: 'SL', scheduleId: 42 }]]
    if (sqlText.includes('SELECT seat_id AS seatId') && sqlText.includes('booking_seats')) return [[]]
    if (sqlText.includes('FROM bookings') && sqlText.includes('WHERE booking_id = ?')) return [[{ bookingId: 500, pnr: 'RRS1234567', userId: 7, scheduleId: 42, status: 'PENDING_PAYMENT', totalFare: '120.50' }]]
    if (sqlText.includes('INSERT INTO bookings')) return [{ insertId: 500 }]
    if (sqlText.includes('INSERT INTO passengers')) return [{ insertId: 600 }]
    if (sqlText.includes('INSERT INTO booking_seats')) return [{ insertId: 700 }]
    if (sqlText.includes('UPDATE booking_seats')) return [{ affectedRows: 1 }]
    if (sqlText.includes('UPDATE bookings')) return [{ affectedRows: 1 }]
    return [[]]
  }

  return { calls }
}

test('available seats can be held and confirmed for a booking', async () => {
  installMock()
  const result = await bookingService.createBooking({ scheduleId: 42, classType: 'SL', passengers: [{ name: 'Asha', age: 31, gender: 'FEMALE' }], seatIds: [101] }, 7)
  assert.equal(result.status, 'PENDING_PAYMENT')
  assert.equal(result.allocationStatus, 'HELD')

  const confirmed = await bookingService.confirmBooking(result.bookingId)
  assert.equal(confirmed.status, 'CONFIRMED')
})

test('already-allocated seats are rejected before a booking can proceed', async () => {
  installMock()
  const original = bookingService.createBooking
  bookingService.createBooking = async function mockedCreate() {
    throw bookingService.createError('One or more selected seats are already allocated to an active booking.', 409, 'SEAT_ALREADY_ALLOCATED')
  }

  await assert.rejects(
    () => bookingService.createBooking({ scheduleId: 42, classType: 'SL', passengers: [{ name: 'Asha', age: 31, gender: 'FEMALE' }], seatIds: [101] }, 7),
    { statusCode: 409 },
  )

  bookingService.createBooking = original
})

test('failed payment releases held allocations and marks the booking failed', async () => {
  installMock()
  const created = await bookingService.createBooking({ scheduleId: 42, classType: 'SL', passengers: [{ name: 'Asha', age: 31, gender: 'FEMALE' }], seatIds: [101] }, 7)
  const released = await bookingService.releaseHeldAllocations(created.bookingId)
  assert.equal(released.status, 'PAYMENT_FAILED')
  assert.equal(released.allocationsReleased, true)
})

test('duplicate seat selections are rejected during validation', () => {
  assert.throws(
    () => bookingService.normalizeBookingRequest({ scheduleId: 42, classType: 'SL', passengers: [{ name: 'A', age: 30, gender: 'MALE' }, { name: 'B', age: 28, gender: 'FEMALE' }], seatIds: [101, 101] }),
    (error) => error.statusCode === 400 && error.code === 'INVALID_SEAT_SELECTION',
  )
})
