const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const request = require('supertest')
const Module = require('node:module')
const path = require('node:path')

const routePath = path.resolve(__dirname, '../src/routes/fareRoutes.js')
const originalLoad = Module._load
let behavior
Module._load = function (requestName, parent, isMain) {
  if (parent && parent.filename === routePath && requestName === '../services/fareCalculationService') {
    return { calculateFare: (...args) => behavior(...args) }
  }
  return originalLoad.call(this, requestName, parent, isMain)
}
let fareRouter
try {
  fareRouter = require(routePath)
} finally {
  Module._load = originalLoad
}

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api', fareRouter)
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({
    error: error.statusCode === 400 ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR',
    message: error.statusCode ? error.message : 'An unexpected server error occurred.',
  }))
  return app
}

test('POST /api/fare/calculate returns the service fare result', async () => {
  behavior = async (input) => {
    assert.deepEqual(input, { scheduleId: 17, classType: 'SL', passengerCount: 2 })
    return { totalFare: '251.00', currency: 'INR' }
  }
  const response = await request(createApp()).post('/api/fare/calculate').send({ scheduleId: 17, classType: 'SL', passengerCount: 2 })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { fare: { totalFare: '251.00', currency: 'INR' } })
})

test('route forwards validation and database failures through error middleware safely', async () => {
  behavior = async () => { throw Object.assign(new Error('bad input'), { statusCode: 400 }) }
  const invalid = await request(createApp()).post('/api/fare/calculate').send({})
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error, 'INVALID_REQUEST')

  behavior = async () => { throw new Error('secret SQL detail') }
  const failed = await request(createApp()).post('/api/fare/calculate').send({ scheduleId: 17, classType: 'SL', passengerCount: 1 })
  assert.equal(failed.status, 500)
  assert.deepEqual(failed.body, { error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' })
})
