
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const servicePath = path.resolve(
  __dirname,
  '../src/services/registrationService.js',
)

const originalLoad = Module._load
const fakePool = {
  execute: async () => [{ insertId: 101 }],
}

Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === servicePath && request === '../config/db') {
    return fakePool
  }

  return originalLoad.call(this, request, parent, isMain)
}

let registerPassenger

try {
  ;({ registerPassenger } = require(servicePath))
} finally {
  Module._load = originalLoad
}

test('registers a passenger and returns a safe passenger object', async () => {
  const passenger = await registerPassenger({
    name: '  Test Passenger  ',
    email: '  PASSENGER@example.com ',
    mobile: '9876543210',
    password: 'StrongPass123',
  })

  assert.equal(passenger.userId, 101)
  assert.equal(passenger.name, 'Test Passenger')
  assert.equal(passenger.email, 'passenger@example.com')
  assert.equal(passenger.mobile, '9876543210')
  assert.equal(passenger.role, 'PASSENGER')
  assert.equal(Object.hasOwn(passenger, 'password'), false)
  assert.equal(Object.hasOwn(passenger, 'password_hash'), false)
})

test('rejects a missing name', async () => {
  await assert.rejects(
    registerPassenger({
      email: 'passenger@example.com',
      password: 'StrongPass123',
    }),
    { statusCode: 400 },
  )
})

test('rejects an invalid email address', async () => {
  await assert.rejects(
    registerPassenger({
      name: 'Test Passenger',
      email: 'not-an-email',
      password: 'StrongPass123',
    }),
    { statusCode: 400 },
  )
})

test('rejects a password shorter than eight characters', async () => {
  await assert.rejects(
    registerPassenger({
      name: 'Test Passenger',
      email: 'passenger@example.com',
      password: 'short',
    }),
    { statusCode: 400 },
  )
})

test('maps duplicate database entries to HTTP 409', async () => {
  const originalExecute = fakePool.execute

  fakePool.execute = async () => {
    const error = new Error('Duplicate entry')
    error.code = 'ER_DUP_ENTRY'
    throw error
  }

  try {
    await assert.rejects(
      registerPassenger({
        name: 'Test Passenger',
        email: 'passenger@example.com',
        password: 'StrongPass123',
      }),
      { statusCode: 409 },
    )
  } finally {
    fakePool.execute = originalExecute
  }
})
test('stores a salted bcrypt hash instead of the plaintext password', async () => {
  const bcrypt = require('bcryptjs')
  const originalExecute = fakePool.execute
  const password = 'StrongPass123'
  let insertedValues

  fakePool.execute = async (_sql, values) => {
    insertedValues = values
    return [{ insertId: 102 }]
  }

  try {
    await registerPassenger({
      name: 'Hash Test Passenger',
      email: 'hash-test@example.com',
      password,
    })

    assert.ok(insertedValues, 'Expected database insert values')
    const storedHash = insertedValues[3]

    assert.notEqual(storedHash, password)
    assert.match(storedHash, /^\$2[aby]\$12\$/)
    assert.equal(await bcrypt.compare(password, storedHash), true)
    assert.equal(await bcrypt.compare('WrongPassword123', storedHash), false)
  } finally {
    fakePool.execute = originalExecute
  }
})
