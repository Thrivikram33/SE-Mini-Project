const REFUND_POLICY = Object.freeze({
  fixedCharge: Object.freeze({
    '1A': 24000,
    '2A': 20000,
    '3A': 18000,
    SL: 12000,
    CC: 18000,
    '2S': 6000,
  }),
  windows: Object.freeze([
    { minimumHours: 48, deductionBasisPoints: 0 },
    { minimumHours: 12, deductionBasisPoints: 2500 },
    { minimumHours: 4, deductionBasisPoints: 5000 },
    { minimumHours: 0, deductionBasisPoints: 10000 },
  ]),
})

function calculateRefund({
  totalPaid,
  passengerCount,
  classType,
  departureAt,
  cancelledAt = new Date(),
}) {
  const paidPaise = Math.round(Number(totalPaid) * 100)

  if (!Number.isSafeInteger(paidPaise) || paidPaise < 0) {
    throw new TypeError('A valid non-negative payment amount is required.')
  }

  if (!Number.isSafeInteger(passengerCount) || passengerCount < 1) {
    throw new TypeError('Passenger count must be a positive integer.')
  }

  const fixedCharge = REFUND_POLICY.fixedCharge[classType]

  if (fixedCharge === undefined) {
    throw new TypeError('Unsupported ticket class.')
  }

  const departure = new Date(departureAt)
  const cancelled = new Date(cancelledAt)

  if (
    Number.isNaN(departure.getTime()) ||
    Number.isNaN(cancelled.getTime())
  ) {
    throw new TypeError('Valid departure and cancellation dates are required.')
  }

  const hoursRemaining =
    (departure.getTime() - cancelled.getTime()) / (60 * 60 * 1000)

  let window

if (hoursRemaining >= 48) {
  window = REFUND_POLICY.windows[0]
} else if (hoursRemaining >= 12) {
  window = REFUND_POLICY.windows[1]
} else if (hoursRemaining >= 4) {
  window = REFUND_POLICY.windows[2]
} else {
  window = REFUND_POLICY.windows[3]
}

  const deduction =
    window.deductionBasisPoints === 0
      ? fixedCharge * passengerCount
      : Math.max(
          Math.round(
            (paidPaise * window.deductionBasisPoints) / 10000,
          ),
          fixedCharge * passengerCount,
        )

  const refundPaise = Math.max(0, Math.min(paidPaise, paidPaise - deduction))

  return {
    refundAmount: refundPaise / 100,
    deductionAmount: (paidPaise - refundPaise) / 100,
    currency: 'INR',
    hoursRemaining,
    refundStatus: refundPaise > 0 ? 'PENDING' : 'NOT_APPLICABLE',
  }
}

module.exports = {
  calculateRefund,
  REFUND_POLICY,
}