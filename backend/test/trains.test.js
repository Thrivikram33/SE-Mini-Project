import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.js'
import jwt from 'jsonwebtoken'

const sampleRows = [{
  scheduleId: 7,
  trainNumber: 'DEMO-01',
  trainName: 'Demonstration Express',
  sourceCode: 'SBC',
  sourceName: 'Bengaluru Central (demo)',
  destinationCode: 'MAS',
  destinationName: 'Chennai Central (demo)',
  departureTime: '23:10:00',
  arrivalTime: '04:20:00',
  classType: 'CC',
  fare: '520.00',
  availableSeats: 12,
}]

let server
let baseUrl
let executeCalls = 0
const jwtSecret = 'integration-test-secret-with-more-than-thirty-two-characters'

before(async () => {
  const db = {
    async execute(_sql, params) {
      executeCalls += 1
      if (_sql.includes('FROM users WHERE user_id')) return [[{ userId: 14, name: 'Passenger', email: 'p@example.com', mobile: '9876543210', role: 'PASSENGER', active: true }]]
      if (_sql.includes('WHERE sch.schedule_id = ? AND tr.active')) return [[{ scheduleId: 7, journeyDate: '2030-05-12', status: 'SCHEDULED', trainNumber: 'DEMO-01', trainName: 'Demonstration Express' }]]
      if (_sql.includes('FROM fares fa')) return [[
        { classType: 'CC', fare: '520.00', seatId: 8, seatNumber: '1A', seatStatus: 'AVAILABLE' },
        { classType: 'CC', fare: '520.00', seatId: 9, seatNumber: '1B', seatStatus: 'BOOKED' },
      ]]
      assert.deepEqual(params, ['SBC', 'MAS', 'CC', '2030-05-12'])
      return [sampleRows]
    },
    async query() { return [[{ ok: 1 }]] },
  }
  const app = createApp({ db, config: { clientOrigin: 'http://localhost:5173', jwtSecret, nodeEnv: 'test', cancellationRefundPercent: 80 } })
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('search returns database-backed schedule fields and overnight duration', async () => {
  const response = await fetch(`${baseUrl}/api/trains/search?source=sbc&destination=mas&date=2030-05-12&class=cc`)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data[0].trainName, 'Demonstration Express')
  assert.equal(body.data[0].fare, 520)
  assert.equal(body.data[0].availableSeats, 12)
  assert.equal(body.data[0].durationMinutes, 310)
  assert.equal(executeCalls, 1)
})

test('search rejects same station before querying the database', async () => {
  const response = await fetch(`${baseUrl}/api/trains/search?source=SBC&destination=SBC&date=2030-05-12`)
  assert.equal(response.status, 400)
  const body = await response.json()
  assert.equal(body.error.code, 'SAME_STATION')
  assert.ok(body.error.requestId)
  assert.equal(executeCalls, 1)
})

test('search rejects impossible and past dates', async () => {
  for (const date of ['2030-02-30', '2020-01-01']) {
    const response = await fetch(`${baseUrl}/api/trains/search?source=SBC&destination=MAS&date=${date}`)
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, 'INVALID_DATE')
  }
  assert.equal(executeCalls, 1)
})

test('availability groups real class seats and counts only available inventory', async () => {
  const response = await fetch(`${baseUrl}/api/trains/7/availability`)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.classes[0].classType, 'CC')
  assert.equal(body.data.classes[0].availableSeats, 1)
  assert.deepEqual(body.data.classes[0].seats.map((seat) => seat.status), ['AVAILABLE', 'BOOKED'])
})

test('health reports database status without exposing implementation details', async () => {
  const response = await fetch(`${baseUrl}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' })
})

test('admin API rejects unauthenticated and passenger requests', async () => {
  const anonymous = await fetch(`${baseUrl}/api/admin/trains`)
  assert.equal(anonymous.status, 401)
  const token = jwt.sign({ role: 'ADMIN' }, jwtSecret, { subject: '14', issuer: 'rrs-api', audience: 'rrs-client', expiresIn: '1h' })
  const passenger = await fetch(`${baseUrl}/api/admin/trains`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(passenger.status, 403)
  assert.equal((await passenger.json()).error.code, 'FORBIDDEN')
})
