const { test } = require('node:test')
const assert = require('node:assert/strict')

process.env.DB_HOST ||= '127.0.0.1'
process.env.DB_USER ||= 'rrs_test'
process.env.DB_PASSWORD ||= 'rrs_test'
process.env.DB_NAME ||= 'railway_reservation_test'

const { generatePnr } = require('../src/services/bookingService')

test('generates a non-empty 12-character PNR', () => {
  const pnr = generatePnr()

  assert.equal(typeof pnr, 'string')
  assert.equal(pnr.length, 12)
  assert.match(pnr, /^[A-HJ-NP-Z2-9]{12}$/)
})

test('generates distinct PNRs across repeated calls', () => {
  const pnrs = new Set(Array.from({ length: 1000 }, () => generatePnr()))

  assert.equal(pnrs.size, 1000)
})