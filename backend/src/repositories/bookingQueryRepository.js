function bookingSelect() {
  return `SELECT
    b.booking_id AS bookingId,
    b.pnr,
    b.status,
    b.total_fare AS totalFare,
    b.class_type AS classType,
    b.created_at AS bookedAt,
    t.train_number AS trainNumber,
    t.train_name AS trainName,
    origin.code AS originCode,
    origin.name AS originName,
    destination.code AS destinationCode,
    destination.name AS destinationName,
    DATE_FORMAT(
      DATE_ADD(sc.journey_date, INTERVAL COALESCE(origin_stop.day_offset, 0) DAY),
      '%Y-%m-%d'
    ) AS journeyDate,
    COALESCE((
      SELECT payment.status
      FROM payments payment
      WHERE payment.booking_id = b.booking_id
      ORDER BY payment.payment_id DESC
      LIMIT 1
    ), 'NOT_AVAILABLE') AS paymentStatus,
    COALESCE((
      SELECT fare.currency
      FROM fares fare
      WHERE fare.schedule_id = b.schedule_id
        AND fare.class_type = b.class_type
      LIMIT 1
    ), 'INR') AS currency
  FROM bookings b
  JOIN schedules sc ON sc.schedule_id = b.schedule_id
  JOIN trains t ON t.train_id = sc.train_id
  LEFT JOIN route_stops origin_stop
    ON origin_stop.train_id = sc.train_id
   AND origin_stop.station_id = b.origin_station_id
  LEFT JOIN stations origin ON origin.station_id = b.origin_station_id
  LEFT JOIN stations destination ON destination.station_id = b.destination_station_id`
}

function toBooking(row) {
  return {
    ...row,
    bookingId: Number(row.bookingId),
    origin: row.originCode
      ? { code: row.originCode, name: row.originName }
      : null,
    destination: row.destinationCode
      ? { code: row.destinationCode, name: row.destinationName }
      : null,
  }
}

function createBookingQueryRepository(db) {
  return {
    async listForPassenger(userId) {
      const [rows] = await db.execute(
        `${bookingSelect()}
         WHERE b.user_id = ?
         ORDER BY b.created_at DESC, b.booking_id DESC`,
        [userId],
      )

      return rows.map(toBooking)
    },

    async findPassengerBookingByPnr(pnr, userId) {
      const [rows] = await db.execute(
        `${bookingSelect()}
         WHERE b.pnr = ? AND b.user_id = ?
         LIMIT 1`,
        [pnr, userId],
      )
      if (rows.length === 0) return null

      const booking = toBooking(rows[0])
      const [passengers] = await db.execute(
        `SELECT
           passenger.passenger_id AS passengerId,
           passenger.name,
           passenger.age,
           passenger.gender,
           seat.seat_number AS seatNumber
         FROM passengers passenger
         LEFT JOIN booking_seats allocation
           ON allocation.passenger_id = passenger.passenger_id
          AND allocation.booking_id = passenger.booking_id
         LEFT JOIN seats seat ON seat.seat_id = allocation.seat_id
         WHERE passenger.booking_id = ?
         ORDER BY passenger.passenger_id`,
        [booking.bookingId],
      )

      return { ...booking, passengers }
    },
  }
}

module.exports = { createBookingQueryRepository }
