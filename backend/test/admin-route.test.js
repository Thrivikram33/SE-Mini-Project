const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const express = require('express')
const session = require('express-session')

const routePath = path.resolve(__dirname, '../src/routes/adminRoutes.js')
const originalLoad = Module._load
let createdActor
let createTrainBehavior = async () => ({ trainId: 1 })
let adminRouter
Module._load = function (requestName, parent, isMain) {
  if (parent && parent.filename === routePath && requestName === '../services/adminManagementService') {
    return {
      createAdminManagementService: () => ({
        listStations: async () => [], listTrains: async () => [], listSchedules: async () => [],
        createTrain: async (actor, input) => { createdActor = actor; return createTrainBehavior(actor, input) },
        updateTrain: async () => ({}), createSchedule: async () => ({}), updateSchedule: async () => ({}),
        listFares: async () => [], saveFare: async () => ({}), listInventory: async () => [],
        addCoach: async () => ({}), updateSeat: async () => ({}),
      }),
    }
  }
  return originalLoad.call(this, requestName, parent, isMain)
}
try {
  adminRouter = require(routePath)
} finally {
  Module._load = originalLoad
}

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(session({ secret: 'admin-route-test-secret', resave: false, saveUninitialized: false }))
  app.post('/test/session/:role', (req, res) => {
    req.session.user = { userId: 84, role: req.params.role.toUpperCase() }
    req.session.save(() => res.sendStatus(204))
  })
  app.use('/api', adminRouter)
  app.use((error, _req, res, _next) => res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected server error occurred.' }))
  return app
}

test('administrator management rejects unauthenticated and passenger users on reads and writes', async () => {
  const app = createApp()
  const request = require('supertest')
  assert.equal((await request(app).get('/api/admin/trains')).status, 401)
  const passenger = request.agent(app)
  await passenger.post('/test/session/passenger')
  assert.equal((await passenger.get('/api/admin/trains')).status, 403)
  assert.equal((await passenger.post('/api/admin/trains').send({})).status, 403)
  assert.equal((await passenger.put('/api/admin/seats/1').send({})).status, 403)
})

test('administrator route derives audit actor from the authorized session and returns the created resource', async () => {
  const app = createApp()
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/admin')
  createTrainBehavior = async (_actor, input) => ({ trainId: 19, trainNumber: input.trainNumber })
  const response = await agent.post('/api/admin/trains').send({ trainNumber: 'T-10' })
  assert.equal(response.status, 201)
  assert.equal(response.body.train.trainId, 19)
  assert.equal(createdActor, 84)
})

test('administrator API returns safe validation errors and hides unexpected database failures', async () => {
  const app = createApp()
  const agent = require('supertest').agent(app)
  await agent.post('/test/session/admin')
  createTrainBehavior = async () => { throw Object.assign(new Error('Correct the train details.'), { statusCode: 400, code: 'VALIDATION_ERROR' }) }
  const invalid = await agent.post('/api/admin/trains').send({})
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error, 'VALIDATION_ERROR')
  createTrainBehavior = async () => { throw new Error('private SQL details') }
  const failed = await agent.post('/api/admin/trains').send({})
  assert.equal(failed.status, 500)
  assert.equal(JSON.stringify(failed.body).includes('private SQL details'), false)
})
