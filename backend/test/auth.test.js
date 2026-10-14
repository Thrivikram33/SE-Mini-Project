import assert from 'node:assert/strict'
import { test } from 'node:test'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createAuthService } from '../src/auth/authService.js'
import { requireAuth, requireRole } from '../src/auth/authMiddleware.js'
import { ApiError } from '../src/shared/apiError.js'

const secret = 'unit-test-secret-that-is-long-enough-to-be-safe'

test('registration validates fields, normalizes email, and stores only a password hash', async () => {
  let created
  const service = createAuthService({
    async create(user) { created = user; return { userId: 3, name: user.name, email: user.email, mobile: user.mobile, role: 'PASSENGER' } },
  }, secret)
  const result = await service.register({
    name: '  Pat Passenger ', email: 'PAT@example.com', mobile: '+91 98765 43210',
    password: 'safe long test password', role: 'ADMIN',
  })
  assert.equal(result.role, 'PASSENGER')
  assert.equal(created.email, 'pat@example.com')
  assert.notEqual(created.passwordHash, 'safe long test password')
  assert.equal(await bcrypt.compare('safe long test password', created.passwordHash), true)
  await assert.rejects(
    service.register({ name: 'X', email: 'bad', mobile: '123', password: 'short' }),
    (error) => error instanceof ApiError && error.status === 400 && error.code === 'VALIDATION_ERROR',
  )
})

test('duplicate email returns a conflict without leaking database details', async () => {
  const service = createAuthService({
    async create() { throw Object.assign(new Error('duplicate users.email SQL detail'), { code: 'ER_DUP_ENTRY' }) },
  }, secret)
  await assert.rejects(
    service.register({ name: 'Pat Passenger', email: 'pat@example.com', mobile: '9876543210', password: 'safe long test password' }),
    (error) => error instanceof ApiError && error.status === 409 && error.message === 'An account with this email already exists.',
  )
})

test('login issues a short-lived role token only for active users with the correct password', async () => {
  const passwordHash = await bcrypt.hash('safe long test password', 4)
  const service = createAuthService({ async findByEmail() {
    return { userId: 9, name: 'Admin', email: 'admin@example.com', mobile: '9876543210', role: 'ADMIN', active: 1, passwordHash }
  } }, secret)
  const result = await service.login({ email: 'ADMIN@example.com', password: 'safe long test password' })
  const claims = jwt.verify(result.token, secret, { issuer: 'rrs-api', audience: 'rrs-client' })
  assert.equal(claims.sub, '9')
  assert.equal(claims.role, 'ADMIN')
  assert.equal(result.user.passwordHash, undefined)
  await assert.rejects(
    service.login({ email: 'admin@example.com', password: 'incorrect password' }),
    (error) => error instanceof ApiError && error.status === 401 && error.code === 'INVALID_CREDENTIALS',
  )
})

test('login rejects an unknown account with the same safe credential error', async () => {
  const service = createAuthService({ async findByEmail() { return null } }, secret)
  await assert.rejects(
    service.login({ email: 'missing@example.com', password: 'safe long test password' }),
    (error) => error instanceof ApiError && error.status === 401 && error.code === 'INVALID_CREDENTIALS',
  )
})

test('authentication reloads current role and role guard denies a passenger', async () => {
  const token = jwt.sign({ role: 'ADMIN' }, secret, { subject: '11', issuer: 'rrs-api', audience: 'rrs-client', expiresIn: '1h' })
  const req = { headers: { authorization: `Bearer ${token}` }, get(name) { return this.headers[name.toLowerCase()] } }
  let authError
  await new Promise((resolve) => requireAuth(secret, { async findById() {
    return { userId: 11, name: 'Passenger', email: 'p@example.com', mobile: '9876543210', role: 'PASSENGER', active: true }
  } })(req, {}, (error) => { authError = error; resolve() }))
  assert.equal(authError, undefined)
  assert.equal(req.auth.role, 'PASSENGER')
  let roleError
  requireRole('ADMIN')(req, {}, (error) => { roleError = error })
  assert.equal(roleError.status, 403)
})

test('malformed percent-encoding in the session cookie is rejected as unauthenticated', async () => {
  const req = { headers: { cookie: 'rrs_access=%ZZ' }, get() { return undefined } }
  let authError
  await new Promise((resolve) => requireAuth(secret, { async findById() { throw new Error('Must not query users without a valid token.') } })(req, {}, (error) => {
    authError = error
    resolve()
  }))
  assert.equal(authError.status, 401)
  assert.equal(authError.code, 'AUTH_REQUIRED')
})
