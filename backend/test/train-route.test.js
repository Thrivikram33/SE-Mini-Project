const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const routePath = path.resolve(__dirname, '../src/routes/trainRoutes.js')
const originalLoad = Module._load
let searchBehavior
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === routePath && request === '../services/trainSearchService') {
    return { searchTrains: (...args) => searchBehavior(...args) }
  }
  return originalLoad.call(this, request, parent, isMain)
}
let trainRouter
try {
  trainRouter = require(routePath)
} finally {
  Module._load = originalLoad
}

const express = require('express')

function createApp() {
  const app = express()
  app.use('/api/trains', trainRouter)
  app.use((error, _req, res, _next) => {
    if (error.statusCode === 400) {
      return res.status(400).json({ error: 'INVALID_REQUEST', message: error.message })
    }
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
    })
  })
  return app
}

async function getSearch(app, query = 'source=AAA&destination=BBB&date=2030-01-01') {
  const server = app.listen(0)
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/trains/search?${query}`,
    )
    return { status: response.status, body: await response.json() }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

test('GET /api/trains/search returns the documented trains array', async () => {
  searchBehavior = async (query) => {
    assert.deepEqual({ ...query }, { source: 'AAA', destination: 'BBB', date: '2030-01-01' })
    return [{ trainId: 1, scheduleId: 11, classType: 'SL' }]
  }
  const response = await getSearch(createApp())
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { trains: [{ trainId: 1, scheduleId: 11, classType: 'SL' }] })
})

test('GET /api/trains/search returns an empty array for no matches', async () => {
  searchBehavior = async () => []
  const response = await getSearch(createApp())
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { trains: [] })
})

test('GET /api/trains/search uses the established 400 validation response', async () => {
  searchBehavior = async () => {
    const error = new Error('Date must use YYYY-MM-DD format.')
    error.statusCode = 400
    throw error
  }
  const response = await getSearch(createApp())
  assert.equal(response.status, 400)
  assert.deepEqual(response.body, {
    error: 'INVALID_REQUEST',
    message: 'Date must use YYYY-MM-DD format.',
  })
})

test('GET /api/trains/search returns a safe 500 response for database failures', async () => {
  searchBehavior = async () => { throw new Error('private SQL or credential detail') }
  const logMessages = []
  const originalError = console.error
  console.error = (...parts) => logMessages.push(parts.join(' '))
  let response
  try {
    response = await getSearch(createApp())
  } finally {
    console.error = originalError
  }
  assert.equal(response.status, 500)
  assert.deepEqual(response.body, {
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred.',
  })
  assert.deepEqual(logMessages, ['Train search request failed.'])
})
