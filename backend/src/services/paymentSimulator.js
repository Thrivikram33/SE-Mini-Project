const { performance } = require('node:perf_hooks')

function createPaymentSimulator(options = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  return {
    async charge({ outcome = 'success' } = {}) {
      const startedAt = performance.now()
      // Failure is a deterministic development/test control. The simulator never
      // contacts a payment provider or transfers money.
      return {
        success: !(nodeEnv === 'development' && outcome === 'failure'),
        simulatedLatencyMs: performance.now() - startedAt,
      }
    },
  }
}

module.exports = { createPaymentSimulator }
