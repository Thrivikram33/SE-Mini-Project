
const { test, after } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')

process.env.DB_HOST ||= '127.0.0.1'
process.env.DB_USER ||= 'rrs_test'
process.env.DB_PASSWORD ||= 'rrs_test'
process.env.DB_NAME ||= 'railway_reservation_test'

const pool = require('../src/config/db')
process.env.SESSION_SECRET ||= 'test-only-session-secret-for-automated-tests';
const app = require('../src/server')

after(async () => {
  await pool.end()
})

test('class endpoint rejects an invalid schedule ID', async () => {
  const response = await request(app)
    .get('/api/schedules/not-a-number/classes')

  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'INVALID_REQUEST')
})

test('seat endpoint rejects a missing class type', async () => {
  const response = await request(app)
    .get('/api/schedules/1/seats')

  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'INVALID_REQUEST')
})
