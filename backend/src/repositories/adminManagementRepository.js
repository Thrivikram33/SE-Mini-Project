function createAdminManagementRepository(db) {
  return {
    async listStations() {
      const [rows] = await db.execute(
        'SELECT station_id AS stationId, code, name, city FROM stations ORDER BY code',
      )
      return rows
    },

    async listTrains() {
      const [rows] = await db.execute(
        `SELECT t.train_id AS trainId, t.train_number AS trainNumber,
                t.train_name AS trainName, t.active,
                rs.sequence_no AS sequenceNo, st.code AS stationCode,
                st.name AS stationName, rs.arrival_time AS arrivalTime,
                rs.departure_time AS departureTime, rs.day_offset AS dayOffset
         FROM trains t
         LEFT JOIN route_stops rs ON rs.train_id = t.train_id
         LEFT JOIN stations st ON st.station_id = rs.station_id
         ORDER BY t.train_number, rs.sequence_no`,
      )
      const trains = new Map()
      for (const row of rows) {
        if (!trains.has(row.trainId)) {
          trains.set(row.trainId, {
            trainId: Number(row.trainId),
            trainNumber: row.trainNumber,
            trainName: row.trainName,
            active: Boolean(row.active),
            routeStops: [],
          })
        }
        if (row.sequenceNo !== null) {
          trains.get(row.trainId).routeStops.push({
            sequenceNo: Number(row.sequenceNo),
            stationCode: row.stationCode,
            stationName: row.stationName,
            arrivalTime: row.arrivalTime,
            departureTime: row.departureTime,
            dayOffset: Number(row.dayOffset),
          })
        }
      }
      return [...trains.values()]
    },

    async insertTrain(connection, { trainNumber, trainName }) {
      return connection.execute(
        'INSERT INTO trains (train_number, train_name) VALUES (?, ?)',
        [trainNumber, trainName],
      )
    },

    async updateTrain(connection, trainId, { trainNumber, trainName, active }) {
      return connection.execute(
        'UPDATE trains SET train_number = ?, train_name = ?, active = ? WHERE train_id = ?',
        [trainNumber, trainName, active, trainId],
      )
    },

    async getTrainForUpdate(connection, trainId) {
      const [rows] = await connection.execute(
        'SELECT train_id AS trainId FROM trains WHERE train_id = ? FOR UPDATE',
        [trainId],
      )
      return rows[0] || null
    },

    async stationIdsByCode(connection, codes) {
      const placeholders = codes.map(() => '?').join(', ')
      const [rows] = await connection.execute(
        `SELECT station_id AS stationId, code FROM stations WHERE code IN (${placeholders})`,
        codes,
      )
      return rows
    },

    async replaceTrainRoute(connection, trainId, routeStops, stationIds) {
      await connection.execute('DELETE FROM route_stops WHERE train_id = ?', [trainId])
      for (let index = 0; index < routeStops.length; index += 1) {
        const stop = routeStops[index]
        await connection.execute(
          `INSERT INTO route_stops
             (train_id, station_id, sequence_no, arrival_time, departure_time, day_offset)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [trainId, stationIds.get(stop.stationCode), index + 1,
            stop.arrivalTime, stop.departureTime, stop.dayOffset],
        )
      }
    },

    async countTrainSchedules(connection, trainId) {
      const [[row]] = await connection.execute(
        'SELECT COUNT(*) AS scheduleCount FROM schedules WHERE train_id = ?',
        [trainId],
      )
      return Number(row.scheduleCount)
    },

    async countActiveTrainBookings(connection, trainId) {
      const [[row]] = await connection.execute(
        `SELECT COUNT(*) AS bookingCount
         FROM bookings b JOIN schedules s ON s.schedule_id = b.schedule_id
         WHERE s.train_id = ? AND b.status IN ('PENDING_PAYMENT', 'CONFIRMED')`,
        [trainId],
      )
      return Number(row.bookingCount)
    },

    async listSchedules() {
      const [rows] = await db.execute(
        `SELECT s.schedule_id AS scheduleId, s.train_id AS trainId,
                t.train_number AS trainNumber, t.train_name AS trainName,
                DATE_FORMAT(s.journey_date, '%Y-%m-%d') AS journeyDate, s.status,
                (SELECT COUNT(*) FROM coaches c WHERE c.schedule_id = s.schedule_id) AS coachCount,
                (SELECT COUNT(*) FROM seats se JOIN coaches c ON c.coach_id = se.coach_id
                 WHERE c.schedule_id = s.schedule_id) AS seatCount
         FROM schedules s JOIN trains t ON t.train_id = s.train_id
         ORDER BY s.journey_date DESC, s.schedule_id DESC`,
      )
      return rows.map((row) => ({
        ...row,
        scheduleId: Number(row.scheduleId),
        trainId: Number(row.trainId),
        coachCount: Number(row.coachCount),
        seatCount: Number(row.seatCount),
      }))
    },

    async getTrain(connection, trainId) {
      const [rows] = await connection.execute(
        'SELECT train_id AS trainId, active FROM trains WHERE train_id = ? FOR UPDATE',
        [trainId],
      )
      return rows[0] || null
    },

    async countTrainRouteStops(connection, trainId) {
      const [[row]] = await connection.execute(
        'SELECT COUNT(*) AS stopCount FROM route_stops WHERE train_id = ?',
        [trainId],
      )
      return Number(row.stopCount)
    },

    async insertSchedule(connection, { trainId, journeyDate }) {
      return connection.execute(
        "INSERT INTO schedules (train_id, journey_date, status) VALUES (?, ?, 'SCHEDULED')",
        [trainId, journeyDate],
      )
    },

    async getScheduleForUpdate(connection, scheduleId) {
      const [rows] = await connection.execute(
        `SELECT schedule_id AS scheduleId,
                DATE_FORMAT(journey_date, '%Y-%m-%d') AS journeyDate, status
         FROM schedules WHERE schedule_id = ? FOR UPDATE`,
        [scheduleId],
      )
      return rows[0] || null
    },

    async countScheduleBookings(connection, scheduleId, activeOnly = false) {
      const statusFilter = activeOnly ? "AND status IN ('PENDING_PAYMENT', 'CONFIRMED')" : ''
      const [[row]] = await connection.execute(
        `SELECT COUNT(*) AS bookingCount FROM bookings
         WHERE schedule_id = ? ${statusFilter}`,
        [scheduleId],
      )
      return Number(row.bookingCount)
    },

    async updateSchedule(connection, scheduleId, { journeyDate, status }) {
      return connection.execute(
        'UPDATE schedules SET journey_date = ?, status = ? WHERE schedule_id = ?',
        [journeyDate, status, scheduleId],
      )
    },

    async listFares(scheduleId) {
      const [rows] = await db.execute(
        `SELECT fare_id AS fareId, schedule_id AS scheduleId, class_type AS classType,
                amount, currency, updated_at AS updatedAt
         FROM fares WHERE schedule_id = ? ORDER BY class_type`,
        [scheduleId],
      )
      return rows
    },

    async saveFare(connection, scheduleId, { classType, amount, currency }) {
      return connection.execute(
        `INSERT INTO fares (schedule_id, class_type, amount, currency)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE amount = VALUES(amount), currency = VALUES(currency)`,
        [scheduleId, classType, amount, currency],
      )
    },

    async listInventory(scheduleId) {
      const [rows] = await db.execute(
        `SELECT c.coach_id AS coachId, c.class_type AS classType,
                c.coach_number AS coachNumber, s.seat_id AS seatId,
                s.seat_number AS seatNumber, s.berth_type AS berthType, s.status,
                (SELECT COUNT(*) FROM booking_seats bs
                 WHERE bs.seat_id = s.seat_id
                   AND bs.allocation_status IN ('HELD', 'CONFIRMED')) AS activeAllocation
         FROM coaches c LEFT JOIN seats s ON s.coach_id = c.coach_id
         WHERE c.schedule_id = ? ORDER BY c.coach_number, s.seat_number`,
        [scheduleId],
      )
      const coaches = new Map()
      for (const row of rows) {
        if (!coaches.has(row.coachId)) {
          coaches.set(row.coachId, {
            coachId: Number(row.coachId),
            classType: row.classType,
            coachNumber: row.coachNumber,
            seats: [],
          })
        }
        if (row.seatId !== null) {
          coaches.get(row.coachId).seats.push({
            seatId: Number(row.seatId),
            seatNumber: row.seatNumber,
            berthType: row.berthType,
            status: row.status,
            allocated: Number(row.activeAllocation) > 0,
          })
        }
      }
      return [...coaches.values()]
    },

    async insertCoach(connection, scheduleId, { classType, coachNumber }) {
      return connection.execute(
        'INSERT INTO coaches (schedule_id, class_type, coach_number) VALUES (?, ?, ?)',
        [scheduleId, classType, coachNumber],
      )
    },

    async insertSeat(connection, coachId, { seatNumber, berthType, status }) {
      return connection.execute(
        'INSERT INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, ?, ?, ?)',
        [coachId, seatNumber, berthType, status],
      )
    },

    async getSeatForUpdate(connection, seatId) {
      const [rows] = await connection.execute(
        `SELECT s.seat_id AS seatId, s.coach_id AS coachId,
                c.schedule_id AS scheduleId
         FROM seats s JOIN coaches c ON c.coach_id = s.coach_id
         WHERE s.seat_id = ? FOR UPDATE`,
        [seatId],
      )
      return rows[0] || null
    },

    async countActiveSeatAllocations(connection, seatId) {
      const [[row]] = await connection.execute(
        `SELECT COUNT(*) AS allocationCount FROM booking_seats
         WHERE seat_id = ? AND allocation_status IN ('HELD', 'CONFIRMED')`,
        [seatId],
      )
      return Number(row.allocationCount)
    },

    async updateSeat(connection, seatId, { seatNumber, berthType, status }) {
      return connection.execute(
        'UPDATE seats SET seat_number = ?, berth_type = ?, status = ? WHERE seat_id = ?',
        [seatNumber, berthType, status, seatId],
      )
    },

    async audit(connection, { actorUserId, action, entityType, entityId, details }) {
      return connection.execute(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        [actorUserId, action, entityType, String(entityId), JSON.stringify(details)],
      )
    },
  }
}

module.exports = { createAdminManagementRepository }
