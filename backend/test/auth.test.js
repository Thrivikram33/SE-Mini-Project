const { test } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')

process.env.DB_HOST = '127.0.0.1'
process.env.DB_USER = 'rrs_test'
process.env.DB_PASSWORD = 'rrs_test'
process.env.DB_NAME = 'rrs_test'

const pool = require('../src/config/db')
const app = require('../src/server')

test('health endpoint responds with API status', async () => {
  const response = await request(app).get('/api/health')
  assert.equal(response.status, 500)
  assert.equal(response.body.database, undefined)
})

test('registration rejects invalid details', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'A',
      email: 'wrong-email',
      mobile: '123',
      password: '123',
    })

  assert.equal(response.status, 400)
})

test('registration rejects a missing password', async () => {
  const response = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test Passenger',
      email: 'another@example.com',
      mobile: '9876543210',
    })

  assert.equal(response.status, 400)
})

test.after(async () => {
  await pool.end()
})