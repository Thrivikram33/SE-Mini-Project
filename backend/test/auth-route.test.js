const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const bcrypt = require('bcryptjs')

const routePath = path.resolve(__dirname, '../src/routes/auth.js')
const originalLoad = Module._load

let databaseBehavior
let authRouter

Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === routePath && request === '../config/db') {
    return {
      execute: async (...args) => databaseBehavior(...args),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

try {
  authRouter = require(routePath)
} finally {
  Module._load = originalLoad
}

const express = require('express')
const session = require('express-session')
const { requireAuth, requireRole } = require('../src/middleware/authMiddleware')

function createTestApp() {
  const app = express()

  app.use(express.json())
  app.use(
    session({
      name: 'rrs.sid',
      secret: 'test-only-session-secret',
      resave: false,
      saveUninitialized: false,
    }),
  )

  app.use('/api/auth', authRouter)

  app.get('/api/test/protected', requireAuth, (req, res) => {
    res.status(200).json({ message: 'Authenticated', user: req.session.user })
  })

  app.get('/api/test/admin', requireRole('ADMIN'), (req, res) => {
    res.status(200).json({ message: 'Admin access granted' })
  })

  app.get('/api/test/passenger', requireRole('PASSENGER'), (req, res) => {
    res.status(200).json({ message: 'Passenger access granted' })
  })

  // Test-only endpoint for creating a session with a known role.
  app.post('/api/test/session', (req, res) => {
    req.session.user = {
      userId: 7,
      name: 'Test User',
      email: 'test@example.com',
      role: req.body.role,
    }

    req.session.save((error) => {
      if (error) {
        return res.status(500).json({ message: 'Test session failed.' })
      }

      return res.status(200).json({ message: 'Test session created.' })
    })
  })

  return app
}

async function requestJson(app, endpoint, body, cookie, method = 'POST') {
  const server = app.listen(0)

  try {
    const address = server.address()
    const headers = {}

    if (body !== undefined) {
      headers['content-type'] = 'application/json'
    }

    if (cookie) {
      headers.cookie = cookie
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}${endpoint.startsWith('/api/test') ? '' : '/api/auth'}${endpoint}`,
      {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      },
    )

    return {
      status: response.status,
      body: await response.json(),
      cookies: response.headers.getSetCookie(),
    }
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

function getSessionCookie(result) {
  const cookie = result.cookies.find((item) => item.startsWith('rrs.sid='))
  assert.ok(cookie, 'Expected a session cookie')
  return cookie.split(';')[0]
}

test('POST login returns 400 for invalid input', async () => {
  const result = await requestJson(createTestApp(), '/login', {
    email: 'invalid-email',
    password: 'password123',
  })

  assert.equal(result.status, 400)
  assert.equal(result.body.message, 'Invalid login details.')
})

test('POST login returns 401 for an unknown account', async () => {
  databaseBehavior = async (sql, params) => {
    assert.match(sql, /WHERE email = \?/)
    assert.deepEqual(params, ['unknown@example.com'])
    return [[]]
  }

  const result = await requestJson(createTestApp(), '/login', {
    email: 'unknown@example.com',
    password: 'Password123',
  })

  assert.equal(result.status, 401)
  assert.equal(result.body.message, 'Invalid email or password.')
})

test('POST login returns 401 for an incorrect password', async () => {
  const passwordHash = await bcrypt.hash('CorrectPassword123', 4)

  databaseBehavior = async () => [[{
    user_id: 7,
    name: 'Test Passenger',
    email: 'passenger@example.com',
    password_hash: passwordHash,
    role: 'PASSENGER',
  }]]

  const result = await requestJson(createTestApp(), '/login', {
    email: 'passenger@example.com',
    password: 'WrongPassword123',
  })

  assert.equal(result.status, 401)
  assert.equal(result.body.message, 'Invalid email or password.')
})

test('POST login accepts valid credentials and creates a session', async () => {
  const passwordHash = await bcrypt.hash('CorrectPassword123', 4)

  databaseBehavior = async (sql, params) => {
    assert.match(sql, /WHERE email = \?/)
    assert.deepEqual(params, ['passenger@example.com'])

    return [[{
      user_id: 7,
      name: 'Test Passenger',
      email: 'passenger@example.com',
      password_hash: passwordHash,
      role: 'PASSENGER',
    }]]
  }

  const result = await requestJson(createTestApp(), '/login', {
    email: 'PASSENGER@example.com',
    password: 'CorrectPassword123',
  })

  assert.equal(result.status, 200)
  assert.equal(result.body.message, 'Login successful.')
  assert.equal(result.body.user.userId, 7)
  assert.equal(result.body.user.role, 'PASSENGER')
  assert.ok(result.cookies.some((cookie) => cookie.startsWith('rrs.sid=')))
  assert.equal('password_hash' in result.body.user, false)
})

test('POST login returns a safe 500 response when the database fails', async () => {
  databaseBehavior = async () => {
    const error = new Error('Private database details')
    error.code = 'TEST_DATABASE_ERROR'
    throw error
  }

  const result = await requestJson(createTestApp(), '/login', {
    email: 'passenger@example.com',
    password: 'CorrectPassword123',
  })

  assert.equal(result.status, 500)
  assert.equal(result.body.message, 'Login could not be completed.')
  assert.equal(JSON.stringify(result.body).includes('Private database details'), false)
})

test('POST logout succeeds when no session exists', async () => {
  const result = await requestJson(createTestApp(), '/logout')

  assert.equal(result.status, 200)
  assert.equal(result.body.message, 'Logged out successfully.')
})

test('POST logout destroys an active session', async () => {
  const app = createTestApp()

  const created = await requestJson(app, '/api/test/session', { role: 'PASSENGER' })
  assert.equal(created.status, 200)
  const cookie = getSessionCookie(created)

  const logout = await requestJson(app, '/logout', undefined, cookie)
  assert.equal(logout.status, 200)
  assert.equal(logout.body.message, 'Logged out successfully.')

  const afterLogout = await requestJson(app, '/api/test/protected', undefined, cookie, 'GET')
  assert.equal(afterLogout.status, 401)
})

test('protected route rejects unauthenticated users with 401', async () => {
  const result = await requestJson(
    createTestApp(),
    '/api/test/protected',
    undefined,
    undefined,
    'GET',
  )

  assert.equal(result.status, 401)
  assert.equal(result.body.message, 'Authentication required.')
})

test('admin-only route rejects a passenger with 403', async () => {
  const app = createTestApp()
  const created = await requestJson(app, '/api/test/session', { role: 'PASSENGER' })
  const cookie = getSessionCookie(created)

  const result = await requestJson(app, '/api/test/admin', undefined, cookie, 'GET')

  assert.equal(result.status, 403)
  assert.equal(result.body.message, 'You are not authorized to access this resource.')
})

test('admin-only route allows an administrator', async () => {
  const app = createTestApp()
  const created = await requestJson(app, '/api/test/session', { role: 'ADMIN' })
  const cookie = getSessionCookie(created)

  const result = await requestJson(app, '/api/test/admin', undefined, cookie, 'GET')

  assert.equal(result.status, 200)
  assert.equal(result.body.message, 'Admin access granted')
})

test('passenger-only route allows a passenger', async () => {
  const app = createTestApp()
  const created = await requestJson(app, '/api/test/session', { role: 'PASSENGER' })
  const cookie = getSessionCookie(created)

  const result = await requestJson(app, '/api/test/passenger', undefined, cookie, 'GET')

  assert.equal(result.status, 200)
  assert.equal(result.body.message, 'Passenger access granted')
})

test('login error logs never contain the submitted plaintext password', async () => {
  const password = 'SecretPassword987!'
  const originalConsoleError = console.error
  const loggedOutput = []

  databaseBehavior = async () => {
    const error = new Error('Database unavailable')
    error.code = 'TEST_DATABASE_ERROR'
    throw error
  }

  console.error = (...args) => loggedOutput.push(args.join(' '))

  try {
    const result = await requestJson(createTestApp(), '/login', {
      email: 'passenger@example.com',
      password,
    })

    assert.equal(result.status, 500)
    assert.equal(loggedOutput.length, 1)
    assert.equal(loggedOutput.join(' ').includes(password), false)
    assert.equal(loggedOutput.join(' ').includes('TEST_DATABASE_ERROR'), true)
  } finally {
    console.error = originalConsoleError
  }
})