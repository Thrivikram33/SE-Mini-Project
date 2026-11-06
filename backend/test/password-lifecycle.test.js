const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const bcrypt = require('bcryptjs')

const dbPath = path.resolve(__dirname, '../src/config/db.js')
const originalLoad = Module._load
const users = new Map()
let nextId = 1
let lastInsert

Module._load = function (request, parent, isMain) {
  if (parent && request === '../config/db') {
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (resolved === dbPath) {
      return {
        execute: async (sql, params) => {
          if (sql.includes('INSERT INTO users')) {
            lastInsert = { sql, params }
            const [name, email, mobile, password_hash] = params
            const user = { user_id: nextId++, name, email, mobile, password_hash, role: 'PASSENGER' }
            users.set(email, user)
            return [{ insertId: user.user_id }]
          }

          if (sql.includes('FROM users')) {
            const user = users.get(params[0])
            return [user ? [user] : []]
          }

          throw new Error('Unexpected SQL in password lifecycle test')
        },
      }
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let registrationRouter
let authRouter
try {
  registrationRouter = require('../src/routes/registrationRoutes')
  authRouter = require('../src/routes/auth')
} finally {
  Module._load = originalLoad
}

const express = require('express')
const session = require('express-session')

function createApp() {
  const app = express()
  app.use(express.json())
  app.use(session({
    name: 'rrs.sid',
    secret: 'test-only-session-secret',
    resave: false,
    saveUninitialized: false,
  }))
  app.use('/api/auth/register', registrationRouter)
  app.use('/api/auth', authRouter)
  app.use((error, _req, res, _next) => {
    res.status(500).json({ message: 'Unexpected server error.' })
  })
  return app
}

async function post(app, pathName, body) {
  const server = app.listen(0)
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${pathName}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('registration stores a bcrypt hash that login verifies without exposing it', async () => {
  users.clear()
  lastInsert = undefined
  const app = createApp()
  const password = 'StrongPassword123!'

  const registered = await post(app, '/api/auth/register', {
    name: 'Lifecycle User',
    email: 'lifecycle@example.com',
    mobile: '9876543210',
    password,
  })

  assert.equal(registered.status, 201)
  assert.equal(JSON.stringify(registered.body).includes(password), false)
  assert.equal(JSON.stringify(registered.body).includes('password_hash'), false)
  assert.ok(lastInsert)
  assert.notEqual(lastInsert.params[3], password)
  assert.equal(await bcrypt.compare(password, lastInsert.params[3]), true)

  const validLogin = await post(app, '/api/auth/login', {
    email: 'lifecycle@example.com',
    password,
  })
  assert.equal(validLogin.status, 200)
  assert.equal(validLogin.body.user.email, 'lifecycle@example.com')
  assert.equal(JSON.stringify(validLogin.body).includes(lastInsert.params[3]), false)

  const invalidLogin = await post(app, '/api/auth/login', {
    email: 'lifecycle@example.com',
    password: 'WrongPassword123!',
  })
  assert.equal(invalidLogin.status, 401)
  assert.equal(JSON.stringify(invalidLogin.body).includes(password), false)
})
