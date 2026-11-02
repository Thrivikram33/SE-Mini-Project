const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const servicePath = path.resolve(__dirname, '../src/services/fareCalculationService.js')
const originalLoad = Module._load
let queryBehavior
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === servicePath && request === '../config/db') {
    return { execute: (...args) => queryBehavior(...args) }
  }
  return originalLoad.call(this, request, parent, isMain)
}
let calculateFare
try {
  ;({ calculateFare } = require(servicePath))
} finally {
  Module._load = originalLoad
}

function configuredFare(unitFare = '125.50', overrides = {}) {
  return {
    scheduleId: 17,
    classType: 'SL',
    unitFare,
    currency: 'INR',
    ...overrides,
  }
}

function setDatabase(result = [configuredFare()]) {
  const calls = []
  queryBehavior = async (sql, params) => {
    calls.push({ sql, params })
    return [result]
  }
  return calls
}

test('TC-FARE-01 calculates configured class fare multiplied by passenger count', async () => {
  const calls = setDatabase()
  const fare = await calculateFare({ scheduleId: 17, classType: 'SL', passengerCount: 2 })
  assert.deepEqual(fare, {
    scheduleId: 17,
    classType: 'SL',
    passengerCount: 2,
    unitFare: '125.50',
    totalFare: '251.00',
    currency: 'INR',
  })
  assert.deepEqual(calls[0].params, ['SL', 17])
  assert.match(calls[0].sql, /f\.schedule_id = sc\.schedule_id/)
})

test('uses different configured fares and accepts a zero fare from configuration', async () => {
  setDatabase([configuredFare('49.99', { classType: '2A' })])
  assert.equal((await calculateFare({ scheduleId: '17', classType: '2A', passengerCount: 3 })).totalFare, '149.97')
  setDatabase([configuredFare('0.00')])
  assert.equal((await calculateFare({ scheduleId: 17, classType: 'SL', passengerCount: 1 })).totalFare, '0.00')
})

test('reports a missing scheduled journey and missing configured fare separately', async () => {
  setDatabase([])
  await assert.rejects(calculateFare({ scheduleId: 999, classType: 'SL', passengerCount: 1 }), { statusCode: 404, message: 'Scheduled journey not found.' })
  setDatabase([configuredFare(null)])
  await assert.rejects(calculateFare({ scheduleId: 17, classType: 'SL', passengerCount: 1 }), { statusCode: 404, message: 'No fare is configured for this schedule and class.' })
})

test('rejects malformed IDs, classes, passenger counts, and injection-like values before querying', async () => {
  const calls = setDatabase()
  for (const input of [
    { scheduleId: 'not-a-schedule', classType: 'SL', passengerCount: 1 },
    { scheduleId: '1 OR 1=1', classType: 'SL', passengerCount: 1 },
    { scheduleId: 1, classType: 'invalid', passengerCount: 1 },
    { scheduleId: 1, classType: 'SL', passengerCount: 0 },
    { scheduleId: 1, classType: 'SL', passengerCount: -1 },
    { scheduleId: 1, classType: 'SL', passengerCount: 1.5 },
    { scheduleId: 1, classType: 'SL', passengerCount: '2' },
    { scheduleId: 1, classType: 'SL' },
  ]) {
    await assert.rejects(calculateFare(input), { statusCode: 400 })
  }
  assert.equal(calls.length, 0)
})

test('rejects corrupt database fare values and guards totals beyond DECIMAL(10,2)', async () => {
  setDatabase([configuredFare('NaN')])
  await assert.rejects(calculateFare({ scheduleId: 17, classType: 'SL', passengerCount: 1 }), { statusCode: 500 })
  setDatabase([configuredFare('99999999.99')])
  await assert.rejects(calculateFare({ scheduleId: 17, classType: 'SL', passengerCount: 2 }), { statusCode: 400 })
})

test('propagates database connection failures for safe HTTP handling', async () => {
  queryBehavior = async () => { throw new Error('database unavailable') }
  await assert.rejects(calculateFare({ scheduleId: 17, classType: 'SL', passengerCount: 1 }), /database unavailable/)
})
