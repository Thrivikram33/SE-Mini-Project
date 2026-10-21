const pool = require('../config/db')

function invalidRequest(message) {
  const error = new Error(message)
  error.statusCode = 400
  return error
}

function normalizeStation(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw invalidRequest(`${label} is required.`)
  }
  return value.trim().replace(/\s+/g, ' ')
}

function stationKey(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalidRequest('Date must use YYYY-MM-DD format.')
  }
  const [year, month, day] = value.split('-').map(Number)
  if (year === 0) throw invalidRequest('Date must be a valid calendar date.')
  const parsed = new Date(0)
  parsed.setUTCHours(0, 0, 0, 0)
  parsed.setUTCFullYear(year, month - 1, day)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw invalidRequest('Date must be a valid calendar date.')
  }
  // Past dates are rejected by UTC calendar day. No maximum booking horizon is configured.
  if (value < new Date().toISOString().slice(0, 10)) {
    throw invalidRequest('Journey date cannot be in the past.')
  }
  return value
}

function minutesFromJourneyStart(time, dayOffset) {
  if (typeof time !== 'string' || !/^\d{2}:\d{2}:\d{2}$/.test(time)) return null
  const [hours, minutes, seconds] = time.split(':').map(Number)
  if (hours > 23 || minutes > 59 || seconds > 59) return null
  return Number(dayOffset) * 1440 + hours * 60 + minutes
}

function formatDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
}

async function assertDifferentStations(source, destination) {
  const [stations] = await pool.execute(
    `SELECT station_id AS stationId, code, name
     FROM stations
     WHERE LOWER(REGEXP_REPLACE(TRIM(name), '[[:space:]]+', ' ')) IN (LOWER(?), LOWER(?))
        OR LOWER(REGEXP_REPLACE(TRIM(code), '[[:space:]]+', ' ')) IN (LOWER(?), LOWER(?))`,
    [source, destination, source, destination],
  )

  const sourceKey = stationKey(source)
  const destinationKey = stationKey(destination)
  const sourceIds = new Set(stations.filter((station) =>
    stationKey(station.name) === sourceKey || stationKey(station.code) === sourceKey,
  ).map((station) => String(station.stationId)))
  const sameStation = stations.some((station) =>
    sourceIds.has(String(station.stationId)) &&
    (stationKey(station.name) === destinationKey || stationKey(station.code) === destinationKey),
  )
  if (sameStation) throw invalidRequest('Source and destination must be different stations.')
}

async function searchTrains({ source, destination, date }) {
  const normalizedSource = normalizeStation(source, 'Source')
  const normalizedDestination = normalizeStation(destination, 'Destination')
  if (normalizedSource.toLowerCase() === normalizedDestination.toLowerCase()) {
    throw invalidRequest('Source and destination must be different stations.')
  }
  const journeyDate = normalizeDate(date)
  // Resolve names and codes once so aliases for the same stored station are rejected.
  await assertDifferentStations(normalizedSource, normalizedDestination)

  const [rows] = await pool.execute(
    `SELECT
       t.train_id AS trainId,
       t.train_number AS trainNumber,
       t.train_name AS trainName,
       s.schedule_id AS scheduleId,
       DATE_FORMAT(
         DATE_ADD(s.journey_date, INTERVAL source_stop.day_offset DAY),
         '%Y-%m-%d'
       ) AS journeyDate,
       source_station.code AS sourceCode,
       source_station.name AS sourceName,
       source_stop.departure_time AS departureTime,
       source_stop.day_offset AS sourceDayOffset,
       destination_station.code AS destinationCode,
       destination_station.name AS destinationName,
       destination_stop.arrival_time AS arrivalTime,
       destination_stop.day_offset AS destinationDayOffset,
       coach.class_type AS classType,
       fare.amount AS fare,
       fare.currency AS currency,
       COUNT(DISTINCT CASE
         WHEN seat.status = 'AVAILABLE' AND active_booking.booking_id IS NULL
         THEN seat.seat_id
       END) AS availableSeats
     FROM schedules s
     JOIN trains t ON t.train_id = s.train_id AND t.active = TRUE
     JOIN route_stops source_stop ON source_stop.train_id = t.train_id
     JOIN stations source_station ON source_station.station_id = source_stop.station_id
     JOIN route_stops destination_stop
       ON destination_stop.train_id = t.train_id
      AND destination_stop.sequence_no > source_stop.sequence_no
     JOIN stations destination_station
       ON destination_station.station_id = destination_stop.station_id
     JOIN coaches coach ON coach.schedule_id = s.schedule_id
     JOIN fares fare
       ON fare.schedule_id = s.schedule_id AND fare.class_type = coach.class_type
     LEFT JOIN seats seat ON seat.coach_id = coach.coach_id
     LEFT JOIN booking_seats allocation
       ON allocation.seat_id = seat.seat_id
      AND allocation.allocation_status IN ('HELD', 'CONFIRMED')
     LEFT JOIN bookings active_booking
       ON active_booking.booking_id = allocation.booking_id
      AND active_booking.status IN ('PENDING_PAYMENT', 'CONFIRMED')
     WHERE s.journey_date = DATE_SUB(?, INTERVAL source_stop.day_offset DAY)
       AND s.status = 'SCHEDULED'
       AND source_stop.departure_time IS NOT NULL
       AND destination_stop.arrival_time IS NOT NULL
       AND (
        LOWER(REGEXP_REPLACE(TRIM(source_station.name), '[[:space:]]+', ' ')) = LOWER(?) OR
        LOWER(REGEXP_REPLACE(TRIM(source_station.code), '[[:space:]]+', ' ')) = LOWER(?)
       )
       AND (
        LOWER(REGEXP_REPLACE(TRIM(destination_station.name), '[[:space:]]+', ' ')) = LOWER(?) OR
        LOWER(REGEXP_REPLACE(TRIM(destination_station.code), '[[:space:]]+', ' ')) = LOWER(?)
       )
     GROUP BY
       t.train_id, t.train_number, t.train_name, s.schedule_id, s.journey_date,
       source_station.code, source_station.name, source_stop.departure_time,
       source_stop.day_offset, destination_station.code, destination_station.name,
       destination_stop.arrival_time, destination_stop.day_offset,
       coach.class_type, fare.amount, fare.currency
     ORDER BY source_stop.departure_time, t.train_number, coach.class_type`,
    [journeyDate, normalizedSource, normalizedSource, normalizedDestination, normalizedDestination],
  )

  return rows.flatMap((row) => {
    const departure = minutesFromJourneyStart(row.departureTime, row.sourceDayOffset)
    const arrival = minutesFromJourneyStart(row.arrivalTime, row.destinationDayOffset)
    if (departure === null || arrival === null || arrival < departure) return []
    return [{
      trainId: row.trainId,
      trainNumber: row.trainNumber,
      trainName: row.trainName,
      scheduleId: row.scheduleId,
      source: { code: row.sourceCode, name: row.sourceName },
      destination: { code: row.destinationCode, name: row.destinationName },
      departureTime: row.departureTime,
      arrivalTime: row.arrivalTime,
      journeyDate: formatDate(row.journeyDate),
      durationMinutes: arrival - departure,
      arrivalDaysAfterDeparture: Number(row.destinationDayOffset) - Number(row.sourceDayOffset),
      classType: row.classType,
      fare: { amount: Number(row.fare), currency: row.currency },
      availableSeats: Number(row.availableSeats),
    }]
  })
}

module.exports = { searchTrains }
