const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { readDataset: readStationDataset, requireDevelopmentTarget } = require('./import-stations')
const { loadCandidates, readDataset: readTrainDataset } = require('./import-trains')

const CHUNK_SIZE = 500

function chunks(values, size = CHUNK_SIZE) {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function timeValue(value) {
  if (value == null) return null
  return String(value).slice(0, 8)
}

function equalRoute(expected, actual) {
  return expected.length === actual.length && expected.every((stop, index) => {
    const found = actual[index]
    return found &&
      stop.stationCode === found.stationCode &&
      Number(stop.sequence) === Number(found.sequence) &&
      timeValue(stop.arrivalTime) === timeValue(found.arrivalTime) &&
      timeValue(stop.departureTime) === timeValue(found.departureTime) &&
      Number(stop.dayOffset) === Number(found.dayOffset)
  })
}

function equalDays(expected, actual) {
  return expected.length === actual.length && expected.every((day, index) => day === actual[index])
}

async function verifyTrainDataset() {
  requireDevelopmentTarget()
  const stationSource = readStationDataset()
  const trainSource = readTrainDataset()
  const pool = require('../src/config/db')
  const connection = await pool.getConnection()

  try {
    const [runningDaysTables] = await connection.execute(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'train_running_days'`,
    )
    if (!runningDaysTables.length) {
      throw new Error('Migration 006 is required before verifying imported train weekdays.')
    }

    const [databaseStations] = await connection.query(
      'SELECT station_id AS id, code, name FROM stations',
    )
    const stationByCode = new Map(databaseStations.map(row => [
      String(row.code).trim().toUpperCase(), row,
    ]))
    const stationMissing = stationSource.valid.filter(station => !stationByCode.has(station.code)).length
    const stationNameConflicts = stationSource.valid.filter(station => {
      const existing = stationByCode.get(station.code)
      return existing && String(existing.name).trim() !== station.name
    }).length

    const loaded = await loadCandidates(connection, trainSource)
    const eligible = loaded.candidates.filter(item => !item.conflict)
    const exactTrainRows = eligible.filter(item => {
      const existing = loaded.existing.get(item.train.trainNumber)
      return existing && String(existing.name).trim() === item.train.trainName
    })
    const missingTrains = eligible.length - exactTrainRows.length
    const routeByTrain = new Map()
    const daysByTrain = new Map()

    for (const batch of chunks(exactTrainRows)) {
      const trainNumbers = batch.map(item => item.train.trainNumber)
      const placeholders = trainNumbers.map(() => '?').join(',')
      const [routeRows] = await connection.execute(
        `SELECT t.train_number AS trainNumber, s.code AS stationCode,
                rs.sequence_no AS sequence, rs.arrival_time AS arrivalTime,
                rs.departure_time AS departureTime, rs.day_offset AS dayOffset
         FROM trains t
         JOIN route_stops rs ON rs.train_id = t.train_id
         JOIN stations s ON s.station_id = rs.station_id
         WHERE t.train_number IN (${placeholders})
         ORDER BY t.train_number, rs.sequence_no`,
        trainNumbers,
      )
      for (const row of routeRows) {
        const number = String(row.trainNumber).trim().toUpperCase()
        if (!routeByTrain.has(number)) routeByTrain.set(number, [])
        routeByTrain.get(number).push(row)
      }

      const [dayRows] = await connection.execute(
        `SELECT t.train_number AS trainNumber, rwd.weekday AS weekday
         FROM trains t
         JOIN train_running_days rwd ON rwd.train_id = t.train_id
         WHERE t.train_number IN (${placeholders})
         ORDER BY t.train_number, rwd.weekday`,
        trainNumbers,
      )
      for (const row of dayRows) {
        const number = String(row.trainNumber).trim().toUpperCase()
        if (!daysByTrain.has(number)) daysByTrain.set(number, [])
        daysByTrain.get(number).push(Number(row.weekday))
      }
    }

    let routeMismatches = 0
    let actualRouteStops = 0
    let runningDayMismatches = 0
    let actualRunningDays = 0
    const expectedRouteStops = eligible.reduce((count, item) => count + item.train.route.length, 0)
    const expectedRunningDays = eligible.reduce((count, item) => count + item.train.runningDays.length, 0)
    for (const item of exactTrainRows) {
      const number = item.train.trainNumber
      const route = routeByTrain.get(number) || []
      const days = daysByTrain.get(number) || []
      actualRouteStops += route.length
      actualRunningDays += days.length
      if (!equalRoute(item.train.route, route)) routeMismatches += 1
      if (!equalDays(item.train.runningDays, days)) runningDayMismatches += 1
    }

    const [foreignKeyRows] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM route_stops rs
       LEFT JOIN trains t ON t.train_id = rs.train_id
       LEFT JOIN stations s ON s.station_id = rs.station_id
       WHERE t.train_id IS NULL OR s.station_id IS NULL`,
    )
    const [runningDayForeignKeyRows] = await connection.query(
      `SELECT COUNT(*) AS count
       FROM train_running_days running_day
       LEFT JOIN trains t ON t.train_id = running_day.train_id
       WHERE t.train_id IS NULL`,
    )
    const [duplicateRows] = await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM (
           SELECT code FROM stations GROUP BY code HAVING COUNT(*) > 1
         ) duplicates) AS duplicateStationCodes,
         (SELECT COUNT(*) FROM (
           SELECT train_number FROM trains GROUP BY train_number HAVING COUNT(*) > 1
         ) duplicates) AS duplicateTrainNumbers`,
    )

    const report = {
      database: process.env.DB_NAME,
      stations: {
        sourceRecords: stationSource.datasetRecords,
        eligibleUniqueRecords: stationSource.valid.length,
        invalidRecords: stationSource.datasetRecords - stationSource.valid.length - stationSource.duplicateCodes,
        duplicateSourceCodes: stationSource.duplicateCodes,
        databaseRecords: databaseStations.length,
        missingEligibleCodes: stationMissing,
        preservedNameConflicts: stationNameConflicts,
      },
      trains: {
        sourceRecords: trainSource.length,
        eligibleUniqueRecords: loaded.candidates.length,
        invalidByReason: loaded.reasons,
        duplicateSourceNumbers: loaded.duplicateDatasetNumbers,
        preservedNameConflicts: loaded.candidates.filter(item => item.conflict).length,
        databaseRecords: loaded.databaseTrainCount,
        missingEligibleTrains: missingTrains,
        missingSourceDepartures: loaded.missingSourceDeparture,
        missingDestinationArrivals: loaded.missingDestinationArrival,
        chronologyWarnings: loaded.invalidChronology,
        endpointTrimmedTrainCount: loaded.endpointTrimmedTrains,
        routeStopsTrimmedOutsideDeclaredEndpoints: loaded.endpointTrimmedStops,
      },
      routes: {
        eligibleTrainsWithRoute: eligible.length,
        expectedStops: expectedRouteStops,
        actualStops: actualRouteStops,
        mismatchedTrainRoutes: routeMismatches,
        expectedRunningDayRows: expectedRunningDays,
        actualRunningDayRows: actualRunningDays,
        mismatchedTrainRunningDays: runningDayMismatches,
      },
      integrity: {
        routeForeignKeyViolations: Number(foreignKeyRows[0].count),
        runningDayForeignKeyViolations: Number(runningDayForeignKeyRows[0].count),
        duplicateDatabaseStationCodes: Number(duplicateRows[0].duplicateStationCodes),
        duplicateDatabaseTrainNumbers: Number(duplicateRows[0].duplicateTrainNumbers),
      },
    }

    const complete = stationMissing === 0 && stationNameConflicts === 0 &&
      missingTrains === 0 && report.trains.preservedNameConflicts === 0 &&
      routeMismatches === 0 && runningDayMismatches === 0 &&
      report.integrity.routeForeignKeyViolations === 0 &&
      report.integrity.runningDayForeignKeyViolations === 0 &&
      report.integrity.duplicateDatabaseStationCodes === 0 &&
      report.integrity.duplicateDatabaseTrainNumbers === 0
    report.status = complete ? 'PASS' : 'INCOMPLETE'
    console.log(JSON.stringify(report, null, 2))
    if (!complete) process.exitCode = 1
    return report
  } finally {
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  verifyTrainDataset().catch(error => {
    console.error('Train dataset verification failed:', error.message)
    process.exitCode = 1
  })
}

module.exports = { equalDays, equalRoute, verifyTrainDataset }
