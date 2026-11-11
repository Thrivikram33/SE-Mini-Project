import test from 'node:test'
import assert from 'node:assert/strict'
import { getFrontendTransportStatus, validateProductionApiBaseUrl } from '../scripts/transportSecurity.js'

test('production allows same-origin API requests', () => {
  assert.doesNotThrow(() => validateProductionApiBaseUrl(''))
  assert.doesNotThrow(() => validateProductionApiBaseUrl('/gateway'))
})

test('production allows an HTTPS API origin', () => {
  assert.doesNotThrow(() => validateProductionApiBaseUrl('https://api.example.test'))
})

test('production frontend refuses to render over HTTP while development remains usable', () => {
  assert.equal(getFrontendTransportStatus(true, 'http:'), 'https-required')
  assert.equal(getFrontendTransportStatus(true, 'https:'), 'secure')
  assert.equal(getFrontendTransportStatus(false, 'http:'), 'secure')
})

for (const value of [
  'http://api.example.test',
  '//api.example.test',
  '///api.example.test',
  '/\\\\api.example.test',
  '/gateway?debug=true',
  'https://user:secret@api.example.test',
  'https://api.example.test/v1',
  'https://api.example.test?debug=true',
]) {
  test(`production rejects unsafe API base URL ${value}`, () => {
    assert.throws(() => validateProductionApiBaseUrl(value))
  })
}
