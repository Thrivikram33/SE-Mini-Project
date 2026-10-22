const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')

process.env.DB_HOST ||= '127.0.0.1'
process.env.DB_USER ||= 'rrs_test'
process.env.DB_PASSWORD ||= 'rrs_test'
process.env.DB_NAME ||= 'railway_reservation_test'
process.env.SESSION_SECRET ||= 'test-only-session-secret-for-automated-tests'

const pool = require('../src/config/db')
const app = require('../src/server')

after(async () => {
  await pool.end()
})

test('POST /api/bookings rejects unauthenticated requests', async () => {
  const response = await request(app)
    .post('/api/bookings')
    .send({ scheduleId: 1, totalFare: 100 })

  assert.equal(response.status, 401)
})