const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword, verifyPassword } = require('../src/utils/password')

test('hashPassword creates salted bcrypt hashes that verify the password', async () => {
  const password = 'StrongPassword123!'
  const hash = await hashPassword(password)

  assert.notEqual(hash, password)
  assert.match(hash, /^\$2[ab]\$12\$/)
  assert.equal(await verifyPassword(password, hash), true)
  assert.equal(await verifyPassword('incorrect-password', hash), false)
})

test('hashPassword generates a distinct salt for each hash', async () => {
  const first = await hashPassword('StrongPassword123!')
  const second = await hashPassword('StrongPassword123!')

  assert.notEqual(first, second)
  assert.equal(await verifyPassword('StrongPassword123!', first), true)
  assert.equal(await verifyPassword('StrongPassword123!', second), true)
})

test('verifyPassword safely rejects missing or malformed hashes', async () => {
  assert.equal(await verifyPassword('password', null), false)
  assert.equal(await verifyPassword('password', ''), false)
  assert.equal(await verifyPassword('password', 'not-a-bcrypt-hash'), false)
})

test('bcrypt work factor cannot be configured below the secure minimum', async () => {
  const original = process.env.PASSWORD_BCRYPT_ROUNDS

  try {
    process.env.PASSWORD_BCRYPT_ROUNDS = '11'
    await assert.rejects(hashPassword('password'), /integer from 12 to 15/)
  } finally {
    if (original === undefined) delete process.env.PASSWORD_BCRYPT_ROUNDS
    else process.env.PASSWORD_BCRYPT_ROUNDS = original
  }
})
