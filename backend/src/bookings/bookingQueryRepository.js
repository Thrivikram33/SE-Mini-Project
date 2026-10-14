export function createBookingQueryRepository(db) {
  return {
    async findByPnr(pnr) {
      const [rows] = await db.execute(
        `SELECT b.booking_id AS bookingId, b.pnr, b.user_id AS userId,
          b.schedule_id AS scheduleId, b.class_type AS classType, b.status, b.total_fare AS totalFare,
          b.created_at AS createdAt, sch.journey_date AS journeyDate,
          tr.train_number AS trainNumber, tr.train_name AS trainName,
          origin_station.code AS originCode, origin_station.name AS originName,
          destination_station.code AS destinationCode, destination_station.name AS destinationName,
          p.passenger_id AS passengerId, p.name AS passengerName, p.age, p.gender,
          se.seat_number AS seatNumber, co.coach_number AS coachNumber
         FROM bookings b
         JOIN schedules sch ON sch.schedule_id = b.schedule_id
         JOIN trains tr ON tr.train_id = sch.train_id
         JOIN stations origin_station ON origin_station.station_id = b.origin_station_id
         JOIN stations destination_station ON destination_station.station_id = b.destination_station_id
         LEFT JOIN passengers p ON p.booking_id = b.booking_id
         LEFT JOIN booking_seats bs ON bs.passenger_id = p.passenger_id AND bs.booking_id = b.booking_id
         LEFT JOIN seats se ON se.seat_id = bs.seat_id
         LEFT JOIN coaches co ON co.coach_id = se.coach_id
         WHERE b.pnr = ? ORDER BY p.passenger_id`,
        [pnr],
      )
      if (!rows.length) return null
      const first = rows[0]
      const date = first.journeyDate instanceof Date ? first.journeyDate.toISOString().slice(0, 10) : String(first.journeyDate).slice(0, 10)
      return {
        bookingId: Number(first.bookingId),
        pnr: first.pnr,
        userId: Number(first.userId),
        scheduleId: Number(first.scheduleId),
        classType: first.classType,
        status: first.status,
        totalFare: Number(first.totalFare),
        createdAt: first.createdAt,
        journeyDate: date,
        trainNumber: first.trainNumber,
        trainName: first.trainName,
        originCode: first.originCode,
        originName: first.originName,
        destinationCode: first.destinationCode,
        destinationName: first.destinationName,
        passengers: rows.filter((row) => row.passengerId !== null).map((row) => ({
          passengerId: Number(row.passengerId),
          name: row.passengerName,
          age: Number(row.age),
          gender: row.gender,
          seatNumber: row.seatNumber,
          coachNumber: row.coachNumber,
        })),
      }
    },
    async listByUser(userId) {
      const [rows] = await db.execute(
        `SELECT b.booking_id AS bookingId, b.pnr, b.schedule_id AS scheduleId,
          b.class_type AS classType, b.status, b.total_fare AS totalFare, b.created_at AS createdAt,
          sch.journey_date AS journeyDate, tr.train_number AS trainNumber, tr.train_name AS trainName,
          origin_station.code AS originCode, destination_station.code AS destinationCode,
          c.refund_amount AS refundAmount, c.refund_status AS refundStatus,
          COUNT(DISTINCT p.passenger_id) AS passengerCount
         FROM bookings b
         JOIN schedules sch ON sch.schedule_id = b.schedule_id
         JOIN trains tr ON tr.train_id = sch.train_id
         JOIN stations origin_station ON origin_station.station_id = b.origin_station_id
         JOIN stations destination_station ON destination_station.station_id = b.destination_station_id
         LEFT JOIN passengers p ON p.booking_id = b.booking_id
         LEFT JOIN cancellations c ON c.booking_id = b.booking_id
         WHERE b.user_id = ? AND b.status IN ('CONFIRMED', 'CANCELLED')
         GROUP BY b.booking_id, b.pnr, b.schedule_id, b.class_type, b.status, b.total_fare,
          sch.journey_date, tr.train_number, tr.train_name, origin_station.code, destination_station.code,
          c.refund_amount, c.refund_status, b.created_at
         ORDER BY b.created_at DESC`,
        [userId],
      )
      return rows.map((row) => ({
        ...row,
        bookingId: Number(row.bookingId),
        scheduleId: Number(row.scheduleId),
        totalFare: Number(row.totalFare),
        refundAmount: row.refundAmount === null ? null : Number(row.refundAmount),
        passengerCount: Number(row.passengerCount),
        journeyDate: row.journeyDate instanceof Date ? row.journeyDate.toISOString().slice(0, 10) : String(row.journeyDate).slice(0, 10),
      }))
    },
  }
}
