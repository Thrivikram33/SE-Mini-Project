const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { getTransportSecurityConfig, requireSecureTransport } = require('../src/config/transportSecurity')

const validProductionEnv = {
  NODE_ENV: 'production',
  PUBLIC_API_URL: 'https://api.example.test',
  CLIENT_ORIGIN: 'https://www.example.test',
  TRUST_PROXY: '1',
}

test('development permits local HTTP and does not trust forwarded headers', () => {
  assert.deepEqual(getTransportSecurityConfig({ NODE_ENV: 'development' }), {
    production: false,
    trustProxyHops: 0,
    clientOrigin: undefined,
  })
})

test('production accepts HTTPS endpoints and a bounded proxy hop count', () => {
  assert.deepEqual(getTransportSecurityConfig(validProductionEnv), {
    production: true,
    trustProxyHops: 1,
    clientOrigin: 'https://www.example.test',
  })
})

for (const [name, overrides] of [
  ['missing public API URL', { PUBLIC_API_URL: '' }],
  ['HTTP public API URL', { PUBLIC_API_URL: 'http://api.example.test' }],
  ['invalid client origin path', { CLIENT_ORIGIN: 'https://www.example.test/app' }],
  ['HTTP client origin', { CLIENT_ORIGIN: 'http://www.example.test' }],
  ['missing proxy hop count', { TRUST_PROXY: '' }],
  ['trust all proxy headers', { TRUST_PROXY: 'true' }],
  ['zero proxy hops', { TRUST_PROXY: '0' }],
  ['unreasonably large proxy hop count', { TRUST_PROXY: '11' }],
]) {
  test(`production rejects ${name}`, () => {
    assert.throws(() => getTransportSecurityConfig({ ...validProductionEnv, ...overrides }))
  })
}

test('secure transport guard rejects HTTP and accepts TLS from the configured proxy hop', async () => {
  const app = express()
  app.set('trust proxy', 1)
  app.use(requireSecureTransport)
  app.get('/', (_req, res) => res.status(200).send('secure'))
  const server = app.listen(0)

  try {
    const origin = `http://127.0.0.1:${server.address().port}`
    const insecure = await fetch(origin)
    assert.equal(insecure.status, 426)
    assert.equal((await insecure.json()).error, 'HTTPS_REQUIRED')

    const forwardedTls = await fetch(origin, { headers: { 'x-forwarded-proto': 'https' } })
    assert.equal(forwardedTls.status, 200)
    assert.equal(await forwardedTls.text(), 'secure')
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
