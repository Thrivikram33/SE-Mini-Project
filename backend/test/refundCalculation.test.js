const test = require('node:test')
const assert = require('node:assert/strict')

const {
  calculateRefund,
  REFUND_POLICY,
} = require('../src/services/refundCalculationService')

const departureAt = '2026-12-10T12:00:00Z'

function calculate(hours, overrides = {}) {
  const cancelledAt = new Date(
    new Date(departureAt).getTime() - hours * 60 * 60 * 1000,
  )

  return calculateRefund({
    totalPaid: 1000,
    passengerCount: 1,
    classType: 'SL',
    departureAt,
    cancelledAt,
    ...overrides,
  })
}

test('deducts the fixed class charge more than 48 hours before departure', () => {
  const result = calculate(49)
  assert.equal(result.refundAmount, 880)
  assert.equal(result.deductionAmount, 120)
  assert.equal(result.refundStatus, 'PENDING')
})

test('deducts 25 percent between 12 and 48 hours', () => {
  const result = calculate(24)
  assert.equal(result.refundAmount, 750)
})

test('deducts 50 percent between 4 and 12 hours', () => {
  const result = calculate(8)
  assert.equal(result.refundAmount, 500)
})

test('provides no refund below four hours', () => {
  const result = calculate(3)
  assert.equal(result.refundAmount, 0)
  assert.equal(result.refundStatus, 'NOT_APPLICABLE')
})

test('applies the fixed minimum charge to every supported class', () => {
  for (const [classType, charge] of Object.entries(REFUND_POLICY.fixedCharge)) {
    const result = calculate(49, { classType })
    assert.equal(result.deductionAmount, charge / 100)
  }
})

test('calculates minimum charges for multiple passengers', () => {
  const result = calculate(49, { passengerCount: 3 })
  assert.equal(result.deductionAmount, 360)
  assert.equal(result.refundAmount, 640)
})

test('never returns a negative refund', () => {
  const result = calculate(49, {
    totalPaid: 50,
    classType: '1A',
  })
  assert.equal(result.refundAmount, 0)
})

test('rejects unsupported classes', () => {
  assert.throws(() => calculate(49, { classType: 'UNKNOWN' }), /Unsupported/)
})

test('rejects invalid payment amounts', () => {
  assert.throws(() => calculate(49, { totalPaid: -100 }), /payment amount/)
})

test('rejects missing departure information', () => {
  assert.throws(
    () => calculateRefund({
      totalPaid: 1000,
      passengerCount: 1,
      classType: 'SL',
    }),
    /dates are required/,
  )
})

test('applies the exact 48-hour boundary to the fixed-charge window', () => {
  assert.equal(calculate(48).refundAmount, 880)
})

test('applies the exact 12-hour boundary to the 25 percent window', () => {
  assert.equal(calculate(12).refundAmount, 750)
})

test('applies the exact four-hour boundary to the 50 percent window', () => {
  assert.equal(calculate(4).refundAmount, 500)
})