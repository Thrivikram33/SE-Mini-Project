import { ApiError } from '../shared/apiError.js'

const dateOnly = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)

export function calculateRefund(totalFare, refundPercent) {
  return Math.round((Number(totalFare) * Number(refundPercent) / 100 + Number.EPSILON) * 100) / 100
}

export function createCancellationService(db, paymentSimulator, { refundPercent = 80, today = () => new Date().toISOString().slice(0, 10) } = {}) {
  return {
    async quote(userId, pnr, { isAdmin = false } = {}) {
      if (!/^[A-Z0-9]{10}$/.test(String(pnr || '').toUpperCase())) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking was not found.')
      const [rows] = await db.execute(
        `SELECT b.booking_id AS bookingId, b.user_id AS userId, b.status, b.total_fare AS totalFare,
          sch.journey_date AS journeyDate
         FROM bookings b JOIN schedules sch ON sch.schedule_id = b.schedule_id WHERE b.pnr = ? LIMIT 1`,
        [String(pnr).toUpperCase()],
      )
      const booking = rows[0]
      if (!booking) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking was not found.')
      if (Number(booking.userId) !== Number(userId) && !isAdmin) throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to view this booking.')
      if (booking.status !== 'CONFIRMED' || dateOnly(booking.journeyDate) <= today()) {
        throw new ApiError(409, 'BOOKING_NOT_CANCELLABLE', 'This booking is not eligible for cancellation.')
      }
      return { pnr: String(pnr).toUpperCase(), eligible: true, refundPercent, refundAmount: calculateRefund(booking.totalFare, refundPercent), policy: 'Configured project refund percentage before the journey date.' }
    },
    async cancel(userId, pnr, input, { isAdmin = false } = {}) {
      if (input?.confirm !== true) throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Confirm cancellation to continue.')
      if (!/^[A-Z0-9]{10}$/.test(String(pnr || '').toUpperCase())) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking was not found.')
      const connection = await db.getConnection()
      let transactionOpen = false
      try {
        await connection.beginTransaction()
        transactionOpen = true
        const [rows] = await connection.execute(
          `SELECT b.booking_id AS bookingId, b.user_id AS userId, b.status,
            b.total_fare AS totalFare, sch.journey_date AS journeyDate
           FROM bookings b JOIN schedules sch ON sch.schedule_id = b.schedule_id
           WHERE b.pnr = ? FOR UPDATE`,
          [String(pnr).toUpperCase()],
        )
        const booking = rows[0]
        if (!booking) throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking was not found.')
        if (Number(booking.userId) !== Number(userId) && !isAdmin) throw new ApiError(403, 'FORBIDDEN', 'You are not allowed to cancel this booking.')
        if (booking.status !== 'CONFIRMED') throw new ApiError(409, 'BOOKING_NOT_CANCELLABLE', 'This booking is not eligible for cancellation.')
        if (dateOnly(booking.journeyDate) <= today()) throw new ApiError(400, 'CANCELLATION_CLOSED', 'This booking can no longer be cancelled.')

        const [seatRows] = await connection.execute(
          `SELECT bs.seat_id AS seatId FROM booking_seats bs
           WHERE bs.booking_id = ? AND bs.allocation_status = 'CONFIRMED'
           ORDER BY bs.seat_id FOR UPDATE`,
          [booking.bookingId],
        )
        if (!seatRows.length) throw new ApiError(409, 'SEAT_ALLOCATION_MISSING', 'This booking has no active seat allocations.')
        const seatIds = seatRows.map((row) => Number(row.seatId))
        const placeholders = seatIds.map(() => '?').join(',')
        const refundAmount = calculateRefund(booking.totalFare, refundPercent)
        const refund = await paymentSimulator.refund({ amount: refundAmount })

        const [releasedAllocations] = await connection.execute(
          `UPDATE booking_seats SET allocation_status = 'RELEASED'
           WHERE booking_id = ? AND allocation_status = 'CONFIRMED'`,
          [booking.bookingId],
        )
        if (releasedAllocations.affectedRows !== seatIds.length) throw new ApiError(409, 'SEAT_RELEASE_CONFLICT', 'The booking seats changed; retry the cancellation.')
        const [releasedSeats] = await connection.execute(
          `UPDATE seats SET status = 'AVAILABLE' WHERE seat_id IN (${placeholders}) AND status = 'BOOKED'`,
          seatIds,
        )
        if (releasedSeats.affectedRows !== seatIds.length) throw new ApiError(409, 'SEAT_RELEASE_CONFLICT', 'The booking seats changed; retry the cancellation.')
        await connection.execute("UPDATE bookings SET status = 'CANCELLED' WHERE booking_id = ?", [booking.bookingId])
        await connection.execute(
          'INSERT INTO cancellations (booking_id, refund_amount, refund_status) VALUES (?, ?, ?)',
          [booking.bookingId, refundAmount, refund.success ? 'SUCCESS' : 'FAILED'],
        )
        await connection.execute(
          "UPDATE payments SET status = ? WHERE booking_id = ? AND status = 'SUCCESS'",
          [refund.success ? 'REFUNDED' : 'REFUND_FAILED', booking.bookingId],
        )
        await connection.execute(
          'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)',
          [userId, 'BOOKING_CANCELLED', 'booking', String(booking.bookingId)],
        )
        await connection.commit()
        transactionOpen = false
        return { pnr: String(pnr).toUpperCase(), status: 'CANCELLED', refundAmount, refundStatus: refund.success ? 'SUCCESS' : 'FAILED', releasedSeatIds: seatIds }
      } catch (error) {
        if (transactionOpen) await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
    },
  }
}
