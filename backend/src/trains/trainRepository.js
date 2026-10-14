export function createTrainRepository(db) {
  return {
    async listStations() {
      const [rows] = await db.execute(
        'SELECT code, name, city FROM stations WHERE active = TRUE ORDER BY name, code',
      )
      return rows
    },
    async getAvailability(scheduleId) {
      const [scheduleRows] = await db.execute(
        `SELECT sch.schedule_id AS scheduleId, sch.journey_date AS journeyDate, sch.status,
          tr.train_number AS trainNumber, tr.train_name AS trainName
         FROM schedules sch JOIN trains tr ON tr.train_id = sch.train_id
         WHERE sch.schedule_id = ? AND tr.active = TRUE LIMIT 1`,
        [scheduleId],
      )
      if (!scheduleRows.length) return null
      const [rows] = await db.execute(
        `SELECT fa.class_type AS classType, fa.amount AS fare,
          se.seat_id AS seatId, se.seat_number AS seatNumber, se.status AS seatStatus
         FROM fares fa
         LEFT JOIN coaches co ON co.schedule_id = fa.schedule_id AND co.class_type = fa.class_type
         LEFT JOIN seats se ON se.coach_id = co.coach_id
         WHERE fa.schedule_id = ? ORDER BY fa.class_type, co.coach_number, se.seat_number`,
        [scheduleId],
      )
      return { schedule: scheduleRows[0], rows }
    },
    async search({ source, destination, date, classType }) {
      const params = [source, destination]
      const classFilter = classType ? 'AND fa.class_type = ?' : ''
      if (classType) params.push(classType)
      params.push(date)

      const [rows] = await db.execute(
        `SELECT
           sch.schedule_id AS scheduleId,
           tr.train_number AS trainNumber,
           tr.train_name AS trainName,
           src.code AS sourceCode,
           src.name AS sourceName,
           dst.code AS destinationCode,
           dst.name AS destinationName,
           rsrc.departure_time AS departureTime,
           rdst.arrival_time AS arrivalTime,
           fa.class_type AS classType,
           fa.amount AS fare,
           COUNT(DISTINCT CASE WHEN se.status = 'AVAILABLE' THEN se.seat_id END) AS availableSeats
         FROM schedules sch
         JOIN trains tr ON tr.train_id = sch.train_id AND tr.active = TRUE
         JOIN route_stops rsrc ON rsrc.train_id = tr.train_id
         JOIN stations src ON src.station_id = rsrc.station_id AND src.code = ? AND src.active = TRUE
         JOIN route_stops rdst ON rdst.train_id = tr.train_id AND rdst.sequence_no > rsrc.sequence_no
         JOIN stations dst ON dst.station_id = rdst.station_id AND dst.code = ? AND dst.active = TRUE
         JOIN fares fa ON fa.schedule_id = sch.schedule_id ${classFilter}
         LEFT JOIN coaches co ON co.schedule_id = sch.schedule_id AND co.class_type = fa.class_type
         LEFT JOIN seats se ON se.coach_id = co.coach_id
         WHERE sch.journey_date = ? AND sch.status = 'SCHEDULED'
         GROUP BY sch.schedule_id, tr.train_number, tr.train_name, src.code, src.name,
           dst.code, dst.name, rsrc.departure_time, rdst.arrival_time, rsrc.sequence_no,
           rdst.sequence_no, fa.class_type, fa.amount
         ORDER BY rsrc.departure_time, tr.train_number, fa.class_type`,
        params,
      )
      return rows.map((row) => ({
        ...row,
        fare: Number(row.fare),
        availableSeats: Number(row.availableSeats),
      }))
    },
  }
}
