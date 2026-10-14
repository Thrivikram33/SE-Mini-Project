import assert from 'node:assert/strict'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'
import { createApp } from '../src/app.js'

const secret = 'booking-route-unit-test-secret-with-enough-length'

test('passenger cannot retrieve another user’s PNR through the API', async () => {
  const db = {
    async execute(sql) {
      if (sql.includes('FROM users WHERE user_id = ?')) return [[{
        userId: 11, name: 'Requesting Passenger', email: 'requester@example.test',
        mobile: '9876543210', role: 'PASSENGER', active: true,
      }]]
      if (sql.includes('FROM bookings b')) return [[{
        bookingId: 21, pnr: 'AB23456789', userId: 99, scheduleId: 4,
        classType: 'CC', status: 'CONFIRMED', totalFare: '450.00', createdAt: '2030-01-01T00:00:00.000Z',
        journeyDate: '2030-05-12', trainNumber: 'D-100', trainName: 'Demo Coastal Express',
        originCode: 'DMB', originName: 'Demo Station Bengaluru',
        destinationCode: 'DMC', destinationName: 'Demo Station Chennai',
        passengerId: 31, passengerName: 'Private Passenger', age: 34, gender: 'X',
        seatNumber: '1A', coachNumber: 'D1',
      }]]
      throw new Error('Unexpected test query.')
    },
  }
  const app = createApp({
    db,
    config: {
      nodeEnv: 'test', clientOrigin: 'http://localhost:5173', trustProxy: false,
      jwtSecret: secret, cancellationRefundPercent: 80,
    },
  })
  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const { port } = server.address()
    const token = jwt.sign({}, secret, { subject: '11', issuer: 'rrs-api', audience: 'rrs-client', expiresIn: '1h' })
    const response = await fetch(`http://127.0.0.1:${port}/api/bookings/AB23456789`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await response.json()
    assert.equal(response.status, 403)
    assert.equal(body.error.code, 'FORBIDDEN')
    assert.equal(body.data, undefined)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
