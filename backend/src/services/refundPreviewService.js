const { calculateRefund } = require('./refundCalculationService')

function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

async function getRefundPreview(db, userId, bookingId) {
  const connection = await db.getConnection()
  try {
    const [rows] = await connection.execute(
      `SELECT b.booking_id AS bookingId, b.user_id AS userId, b.status,
              b.class_type AS classType, b.origin_station_id AS originStationId,
              s.journey_date AS journeyDate, rs.departure_time AS departureTime,
              rs.day_offset AS dayOffset, p.amount AS totalPaid,
              (SELECT COUNT(*) FROM passengers ps WHERE ps.booking_id = b.booking_id) AS passengerCount
       FROM bookings b
       JOIN schedules s ON s.schedule_id = b.schedule_id
       JOIN route_stops rs ON rs.train_id = s.train_id AND rs.station_id = b.origin_station_id
       JOIN payments p ON p.booking_id = b.booking_id AND p.status = 'SUCCESS'
       WHERE b.booking_id = ? AND b.user_id = ?
       ORDER BY p.payment_id DESC LIMIT 1`,
      [bookingId, userId],
    )
    const booking = rows[0]
    if (!booking) {
      const error = new Error('Booking not found.')
      error.statusCode = 404
      error.code = 'BOOKING_NOT_FOUND'
      throw error
    }
    if (booking.status !== 'CONFIRMED') {
      const error = new Error('This booking is not eligible for cancellation.')
      error.statusCode = 409
      error.code = 'BOOKING_NOT_CANCELLABLE'
      throw error
    }
    if (!booking.departureTime || !booking.journeyDate || !booking.classType) throw new Error('Required booking refund details are unavailable.')
    const departureDate = new Date(`${dateOnly(booking.journeyDate)}T00:00:00.000Z`)
    departureDate.setUTCDate(departureDate.getUTCDate() + Number(booking.dayOffset || 0))
    const [hours, minutes, seconds] = String(booking.departureTime).split(':').map(Number)
    departureDate.setUTCHours(hours, minutes, seconds || 0, 0)
    const passengerCount = Number(booking.passengerCount)
    if (!Number.isSafeInteger(passengerCount) || passengerCount < 1) throw new Error('Valid booking passenger details are unavailable.')
    return calculateRefund({ totalPaid: booking.totalPaid, passengerCount, classType: booking.classType, departureAt: departureDate })
  } finally {
    connection.release()
  }
}

module.exports = { getRefundPreview }