export function createPaymentSimulator({ nodeEnv }) {
  return {
    async charge({ developmentOutcome = 'success' }) {
      // Local deterministic failure mode for TC-PAY-02. Production always uses
      // the simulator's configured success response; no real payment is made.
      return { success: !(nodeEnv === 'development' && developmentOutcome === 'failure') }
    },
    async refund() {
      return { success: true }
    },
  }
}
