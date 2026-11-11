const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createPaymentSimulator } = require('../src/services/paymentSimulator')

test('payment simulator preserves outcomes and reports only its own elapsed time', async () => {
  const simulator = createPaymentSimulator({ nodeEnv: 'development' })
  const success = await simulator.charge({ outcome: 'success' })
  const failure = await simulator.charge({ outcome: 'failure' })

  assert.equal(success.success, true)
  assert.equal(failure.success, false)
  assert.ok(Number.isFinite(success.simulatedLatencyMs))
  assert.ok(success.simulatedLatencyMs >= 0)
  assert.ok(Number.isFinite(failure.simulatedLatencyMs))
  assert.ok(failure.simulatedLatencyMs >= 0)
})
