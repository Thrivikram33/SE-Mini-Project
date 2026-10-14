import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ApiError } from '../src/shared/apiError.js'
import { errorHandler } from '../src/middleware/errorHandler.js'
import { createApp } from '../src/app.js'

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('known API errors preserve their safe status, code, and details', () => {
  const response = responseDouble()
  errorHandler(new ApiError(400, 'VALIDATION_ERROR', 'Correct the form.', { email: 'Invalid email.' }), { requestId: 'request-1' }, response)
  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.body.error, {
    code: 'VALIDATION_ERROR', message: 'Correct the form.', requestId: 'request-1', details: { email: 'Invalid email.' },
  })
})

test('malformed and oversized JSON receive safe client-error responses', () => {
  const malformed = responseDouble()
  errorHandler(Object.assign(new SyntaxError('parser details'), { type: 'entity.parse.failed' }), { requestId: 'request-2' }, malformed)
  assert.equal(malformed.statusCode, 400)
  assert.equal(malformed.body.error.code, 'INVALID_JSON')
  assert.equal(malformed.body.error.requestId, 'request-2')
  assert.equal(malformed.body.error.message.includes('parser details'), false)

  const oversized = responseDouble()
  errorHandler(Object.assign(new Error('body parser details'), { type: 'entity.too.large' }), { requestId: 'request-3' }, oversized)
  assert.equal(oversized.statusCode, 413)
  assert.equal(oversized.body.error.code, 'REQUEST_TOO_LARGE')
  assert.equal(oversized.body.error.message.includes('parser details'), false)
})

test('malformed JSON from an HTTP request includes its request ID and a 400 response', async () => {
  const app = createApp({
    db: {},
    config: {
      nodeEnv: 'test', clientOrigin: 'http://localhost:5173', trustProxy: false,
      jwtSecret: 'test-secret-for-http-error-handler', cancellationRefundPercent: 80,
    },
  })
  const server = app.listen(0, '127.0.0.1')
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const { port } = server.address()
    const response = await fetch(`http://127.0.0.1:${port}/api/health/live`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
    })
    const body = await response.json()
    assert.equal(response.status, 400)
    assert.match(response.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/i)
    assert.equal(body.error.code, 'INVALID_JSON')
    assert.equal(body.error.requestId, response.headers.get('x-request-id'))
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})

test('unexpected errors do not expose or log raw exception messages', () => {
  const response = responseDouble()
  const originalError = console.error
  const logs = []
  console.error = (...values) => logs.push(values.join(' '))
  try {
    errorHandler(new Error('SQL text and password=secret'), { requestId: 'request-4' }, response)
  } finally {
    console.error = originalError
  }
  assert.equal(response.statusCode, 500)
  assert.equal(response.body.error.code, 'INTERNAL_ERROR')
  assert.equal(JSON.stringify(response.body).includes('password=secret'), false)
  assert.equal(logs.join(' ').includes('password=secret'), false)
  assert.match(logs.join(' '), /UNEXPECTED_ERROR/)
})
