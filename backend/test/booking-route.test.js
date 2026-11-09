const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const express = require('express')
const session = require('express-session')

const routePath = path.resolve(__dirname, '../src/routes/bookingRoutes.js')
const originalLoad = Module._load
let createBehavior
let cancelBehavior = async () => ({ bookingId: 9, status: 'CANCELLED', releasedSeatCount: 1 })
let historyBehavior = async () => []
let pnrBehavior = async () => ({ bookingId: 9, pnr: 'PNR2345678AB', status: 'CONFIRMED' })
let capturedUserId
Module._load = function (requestName, parent, isMain) {
  if (parent && parent.filename === routePath && requestName === '../services/bookingService') {
    return { createBookingService: () => ({
      create: async (userId, input) => createBehavior(userId, input),
      cancel: async (userId, bookingId) => cancelBehavior(userId, bookingId),
      getPassengerBookings: async (userId) => historyBehavior(userId),
      getPassengerBookingByPnr: async (userId, pnr) => pnrBehavior(userId, pnr),
    }) }
  }
  if (parent && parent.filename === routePath && requestName === '../services/paymentSimulator') {
    return { createPaymentSimulator: () => ({}) }
  }
  return originalLoad.call(this, requestName, parent, isMain)
}
let bookingRouter
try {
  bookingRouter = require(routePath)
} finally {
  Module._load = originalLoad
}

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(session({ secret: 'test-only-secret', resave: false, saveUninitialized: false }))
  app.post('/test/session/:role', (req, res) => {
    req.session.user = { userId: 42, role: req.params.role.toUpperCase() }
    req.session.save(() => res.sendStatus(204))
  })
  app.use('/api', bookingRouter)
  app.use((error, _req, res, _next) => res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' }))
  return app
}

test('booking endpoint rejects unauthenticated users and administrators', async () => {
  const app = createApp()
  const unauthenticated = await require('supertest')(app).post('/api/bookings').send({})
  assert.equal(unauthenticated.status, 401)
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/admin')
  const admin = await agent.post('/api/bookings').send({})
  assert.equal(admin.status, 403)
})

test('booking endpoint derives the booking owner from the passenger session', async () => {
  const app = createApp()
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/passenger')
  createBehavior = async (userId, input) => {
    capturedUserId = userId
    assert.equal(input.scheduleId, 4)
    return { bookingId: 9, pnr: 'PNR2345678AB', status: 'CONFIRMED' }
  }
  const response = await agent.post('/api/bookings').send({ scheduleId: 4, userId: 999 })
  assert.equal(response.status, 201)
  assert.equal(capturedUserId, 42)
  assert.equal(response.body.booking.pnr, 'PNR2345678AB')
})

test('booking endpoint returns field-level validation details and safe server errors', async () => {
  const app = createApp()
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/passenger')
  createBehavior = async () => { throw Object.assign(new Error('Correct the booking details.'), {
    statusCode: 400, code: 'VALIDATION_ERROR', details: { 'passengers.0.age': 'Passenger age is required.' },
  }) }
  const invalid = await agent.post('/api/bookings').send({})
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.details['passengers.0.age'], 'Passenger age is required.')

  createBehavior = async () => { throw new Error('private SQL details') }
  const failed = await agent.post('/api/bookings').send({})
  assert.equal(failed.status, 500)
  assert.equal(JSON.stringify(failed.body).includes('private SQL details'), false)
})

test('booking retrieval requires passenger authentication and scopes both endpoints to the session owner', async () => {
  const app = createApp()
  assert.equal((await require('supertest')(app).get('/api/bookings')).status, 401)
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/admin')
  assert.equal((await agent.get('/api/bookings')).status, 403)
  await agent.post('/test/session/passenger')
  historyBehavior = async (userId) => { capturedUserId = userId; return [{ bookingId: 9 }] }
  pnrBehavior = async (userId, pnr) => { capturedUserId = userId; assert.equal(pnr, 'pnr2345678ab'); return { bookingId: 9, pnr: 'PNR2345678AB' } }
  const history = await agent.get('/api/bookings')
  assert.equal(history.status, 200)
  assert.deepEqual(history.body.bookings, [{ bookingId: 9 }])
  assert.equal(capturedUserId, 42)
  const ticket = await agent.get('/api/bookings/pnr2345678ab')
  assert.equal(ticket.status, 200)
  assert.equal(ticket.body.booking.pnr, 'PNR2345678AB')
  assert.equal(capturedUserId, 42)
})

test('booking retrieval returns a safe not-found response for invalid or non-owned PNRs', async () => {
  const app = createApp()
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/passenger')
  pnrBehavior = async () => { throw Object.assign(new Error('Booking not found.'), { statusCode: 404, code: 'BOOKING_NOT_FOUND' }) }
  const response = await agent.get('/api/bookings/NOTAREALPNR')
  assert.equal(response.status, 404)
  assert.deepEqual(response.body, { error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' })
})

test('booking cancellation requires passenger authentication and uses the session owner', async () => {
  const app = createApp()
  assert.equal((await require('supertest')(app).post('/api/bookings/9/cancel')).status, 401)

  const agent = require('supertest').agent(app)
  await agent.post('/test/session/admin')
  assert.equal((await agent.post('/api/bookings/9/cancel')).status, 403)

  await agent.post('/test/session/passenger')
  let captured = null
  cancelBehavior = async (userId, bookingId) => {
    captured = { userId, bookingId }
    return { cancellationId: 4, bookingId: Number(bookingId), status: 'CANCELLED', releasedSeatCount: 2 }
  }
  const response = await agent.post('/api/bookings/9/cancel').send({ userId: 999 })
  assert.equal(response.status, 200)
  assert.deepEqual(captured, { userId: 42, bookingId: '9' })
  assert.deepEqual(response.body.cancellation, {
    cancellationId: 4,
    bookingId: 9,
    status: 'CANCELLED',
    releasedSeatCount: 2,
  })
})

test('booking cancellation returns safe client errors and hides database details', async () => {
  const app = createApp()
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/passenger')

  cancelBehavior = async () => {
    throw Object.assign(new Error('Booking not found.'), {
      statusCode: 404,
      code: 'BOOKING_NOT_FOUND',
    })
  }
  const missing = await agent.post('/api/bookings/404/cancel')
  assert.equal(missing.status, 404)
  assert.deepEqual(missing.body, { error: 'BOOKING_NOT_FOUND', message: 'Booking not found.' })

  cancelBehavior = async () => { throw new Error('private SQL details') }
  const failed = await agent.post('/api/bookings/9/cancel')
  assert.equal(failed.status, 500)
  assert.equal(JSON.stringify(failed.body).includes('private SQL details'), false)
})
