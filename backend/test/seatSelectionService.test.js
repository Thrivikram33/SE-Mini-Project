const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const servicePath = path.resolve(__dirname, '../src/services/seatSelectionService.js')
const originalLoad = Module._load
let queryBehavior
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === servicePath && request === '../config/db') {
    return { execute: (...args) => queryBehavior(...args) }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let getClassesForSchedule
let getSeatsForClass
try {
  ;({ getClassesForSchedule, getSeatsForClass } = require(servicePath))
} finally {
  Module._load = originalLoad
}

test('class availability treats every active allocation as unavailable regardless of booking status', async () => {
  const calls = []
  queryBehavior = async (sql, params) => {
    calls.push({ sql, params })
    return [[{ schedule_id: 31, classType: 'SL', availableSeats: 2 }]]
  }

  await getClassesForSchedule('31')
  const sql = calls[1].sql
  assert.match(sql, /bs\.allocation_status IN \('HELD', 'CONFIRMED'\)/)
  assert.match(sql, /NOT EXISTS/)
  assert.doesNotMatch(sql, /JOIN bookings/)
  assert.doesNotMatch(sql, /b\.status IN/)
})

test('seat availability uses the same active-allocation rule as train search', async () => {
  const calls = []
  queryBehavior = async (sql, params) => {
    calls.push({ sql, params })
    return [[{
      seatId: 12,
      seatNumber: '12',
      berthType: 'LOWER',
      available: 0,
    }]]
  }

  const seats = await getSeatsForClass('31', 'SL')
  assert.equal(seats[0].available, false)
  assert.deepEqual(calls[0].params, ['31', 'SL'])
  assert.match(calls[0].sql, /bs\.allocation_status IN \('HELD', 'CONFIRMED'\)/)
  assert.match(calls[0].sql, /EXISTS/)
  assert.doesNotMatch(calls[0].sql, /JOIN bookings/)
  assert.doesNotMatch(calls[0].sql, /b\.status IN/)
})
