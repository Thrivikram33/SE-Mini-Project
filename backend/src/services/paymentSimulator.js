function createPaymentSimulator(options = {}) {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV
  return {
    async charge({ outcome = 'success' } = {}) {
      // Failure is a deterministic development/test control. The simulator never
      // contacts a payment provider or transfers money.
      return { success: !(nodeEnv === 'development' && outcome === 'failure') }
    },
  }
}

module.exports = { createPaymentSimulator }
