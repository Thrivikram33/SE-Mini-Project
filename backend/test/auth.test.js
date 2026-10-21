const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const serverPath = path.resolve(__dirname, '../src/server.js')
const authPath = path.resolve(__dirname, '../src/routes/auth.js')
const registrationServicePath = path.resolve(
  __dirname,
  '../src/services/registrationService.js',
)

const originalLoad = Module._load

Module._load = function (request, parent, isMain) {
  if (
    parent &&
    (
      (parent.filename === serverPath && request === './config/db') ||
      (parent.filename === authPath && request === '../config/db') ||
      (
        parent.filename === registrationServicePath &&
        request === '../../config/db'
      )
    )
  ) {
    return {
      query: async () => [[{ result: 1 }]],
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let app

try {
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET || 'test-only-session-secret-not-for-production'

  app = require('../src/server')
} finally {
  Module._load = originalLoad
}

async function getHealthResponse() {
  const server = app.listen(0)

  try {
    const address = server.address()
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/health`,
    )

    return {
      status: response.status,
      body: await response.json(),
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

test('health endpoint reports API status when database query succeeds', async () => {
  const response = await getHealthResponse()

  assert.equal(response.status, 200)
  assert.equal(response.body.status, 'ok')
  assert.equal(response.body.service, 'railway-reservation-api')
  assert.equal(response.body.database, 'connected')
})
