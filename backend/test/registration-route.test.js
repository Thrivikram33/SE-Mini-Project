
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const routePath = path.resolve(
  __dirname,
  '../src/routes/registrationRoutes.js',
)

const originalLoad = Module._load
let registrationBehavior

Module._load = function (request, parent, isMain) {
  if (
    parent &&
    parent.filename === routePath &&
    request === '../services/registrationService'
  ) {
    return {
      registerPassenger: async (input) => registrationBehavior(input),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let registrationRouter

try {
  registrationRouter = require(routePath)
} finally {
  Module._load = originalLoad
}

const express = require('express')

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth/register', registrationRouter)
  app.use((error, _req, res, _next) => {
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected server error occurred.',
    })
  })
  return app
}

async function requestJson(app, body) {
  const server = app.listen(0)

  try {
    const address = server.address()
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/register`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
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

test('POST registration returns 201 for a valid passenger', async () => {
  registrationBehavior = async () => ({
    userId: 101,
    name: 'Test Passenger',
    email: 'passenger@example.com',
    mobile: null,
    role: 'PASSENGER',
  })

  const result = await requestJson(createTestApp(), {
    name: 'Test Passenger',
    email: 'passenger@example.com',
    password: 'StrongPass123',
  })

  assert.equal(result.status, 201)
  assert.equal(result.body.passenger.userId, 101)
  assert.equal(result.body.passenger.role, 'PASSENGER')
  assert.equal(result.body.message, 'Passenger registered successfully.')
})

test('POST registration returns 400 for validation errors', async () => {
  registrationBehavior = async () => {
    const error = new Error('Please provide a valid email address.')
    error.statusCode = 400
    throw error
  }

  const result = await requestJson(createTestApp(), {
    name: 'Test Passenger',
    email: 'invalid',
    password: 'StrongPass123',
  })

  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'VALIDATION_ERROR')
})

test('POST registration returns 409 for duplicate accounts', async () => {
  registrationBehavior = async () => {
    const error = new Error(
      'An account with this email or mobile number already exists.',
    )
    error.statusCode = 409
    throw error
  }

  const result = await requestJson(createTestApp(), {
    name: 'Test Passenger',
    email: 'passenger@example.com',
    password: 'StrongPass123',
  })

  assert.equal(result.status, 409)
  assert.equal(result.body.error, 'ACCOUNT_ALREADY_EXISTS')
})

test('POST registration returns a safe 500 response for unexpected errors', async () => {
  registrationBehavior = async () => {
    throw new Error('Internal database detail')
  }

  const result = await requestJson(createTestApp(), {
    name: 'Test Passenger',
    email: 'passenger@example.com',
    password: 'StrongPass123',
  })

  assert.equal(result.status, 500)
  assert.equal(result.body.error, 'INTERNAL_SERVER_ERROR')
  assert.equal(
    JSON.stringify(result.body).includes('Internal database detail'),
    false,
  )
})
