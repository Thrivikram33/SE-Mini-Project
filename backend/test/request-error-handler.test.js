const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { requestErrorHandler } = require('../src/middleware/requestErrorHandler')

async function postRaw(body, contentType = 'application/json') {
  const app = express()
  app.use(express.json({ limit: '32b' }))
  app.post('/', (_req, res) => res.status(200).json({ ok: true }))
  app.use(requestErrorHandler)
  const server = app.listen(0)
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    })
    return { status: response.status, body: await response.json() }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('malformed JSON receives a safe 400 response', async () => {
  const result = await postRaw('{"password":"private", broken}')
  assert.equal(result.status, 400)
  assert.equal(result.body.error, 'INVALID_REQUEST')
  assert.equal(result.body.message, 'Request body must contain valid JSON.')
  assert.equal(JSON.stringify(result.body).includes('private'), false)
})

test('oversized JSON receives a safe 413 response', async () => {
  const result = await postRaw(JSON.stringify({ value: 'x'.repeat(128) }))
  assert.equal(result.status, 413)
  assert.equal(result.body.error, 'REQUEST_TOO_LARGE')
  assert.equal(JSON.stringify(result.body).includes('x'.repeat(30)), false)
})

test('unexpected error messages are not returned or written to logs', async () => {
  const app = express()
  app.get('/', (_req, _res, next) => next(new Error('private SQL and request detail')))
  app.use(requestErrorHandler)
  const server = app.listen(0)
  const originalError = console.error
  const logged = []
  console.error = (...args) => logged.push(args.join(' '))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`)
    const body = await response.json()
    assert.equal(response.status, 500)
    assert.equal(body.error, 'INTERNAL_SERVER_ERROR')
    assert.equal(JSON.stringify(body).includes('private SQL'), false)
    assert.equal(logged.join(' ').includes('private SQL'), false)
  } finally {
    console.error = originalError
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
})
