const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const originalLoad = Module._load
const originalResolveFilename = Module._resolveFilename

Module._load = function (request, parent, isMain) {
  if (parent) {
    try {
      const resolvedPath = originalResolveFilename.call(
        Module,
        request,
        parent,
        isMain,
      )

      if (resolvedPath === dbPath) {
        return {
          query: async () => [[{ result: 1 }]],
        }
      }
    } catch {
      // Let Node handle unresolved modules normally.
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let app

try {
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET ||
    'test-only-session-secret-not-for-production'

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

test(
  'health endpoint reports API status when database query succeeds',
  async () => {
    const response = await getHealthResponse()

    assert.equal(response.status, 200)
    assert.equal(response.body.status, 'ok')
    assert.equal(response.body.service, 'railway-reservation-api')
    assert.equal(response.body.database, 'connected')
  },
)