const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { normalizeTrainRecord } = require('./trainDataset')
const { readDataset: readStationDataset } = require('./import-stations')
const { assertDevelopmentTarget, verifyDevelopmentConnection } = require('./developmentDatabase')

const DATASET_PATH = path.resolve(__dirname, '../../trains.txt')
const BATCH_SIZE = 500

function readDataset() {
  const dataset = require('node:fs').readFileSync(DATASET_PATH, 'utf8')
  const parsed = JSON.parse(dataset)
  if (!Array.isArray(parsed)) throw new Error('trains.txt must contain a JSON array.')
  return parsed
}

function indexExisting(rows = []) {
  return new Map(rows.map(row => [String(row.number).trim().toUpperCase(), row]))
}

function prepareCandidates(dataset, stationIds, existing = new Map()) {
  const reasons = {}
  const candidates = []
  const seenNumbers = new Set()
  let duplicateDatasetNumbers = 0
  let endpointTrimmedTrains = 0
  let endpointTrimmedStops = 0

  for (const record of dataset) {
    const number = typeof record?.trainNumber === 'string'
      ? record.trainNumber.trim().toUpperCase()
      : ''

    if (number && seenNumbers.has(number)) {
      duplicateDatasetNumbers += 1
      continue
    }
    if (number) seenNumbers.add(number)

    const normalized = normalizeTrainRecord(record, stationIds)
    if (normalized.reason) {
      reasons[normalized.reason] = (reasons[normalized.reason] || 0) + 1
      continue
    }

    if (normalized.trimmedLeadingStops || normalized.trimmedTrailingStops) {
      endpointTrimmedTrains += 1
      endpointTrimmedStops += normalized.trimmedLeadingStops + normalized.trimmedTrailingStops
    }

    const existingTrain = existing.get(normalized.train.trainNumber)
    if (existingTrain) {
      if (String(existingTrain.name).trim() === normalized.train.trainName) {
        normalized.alreadyPresent = true
      } else {
        normalized.conflict = true
      }
    }

    candidates.push(normalized)
  }

  return {
    stationCount: stationIds.size,
    candidates,
    existing,
    reasons,
    duplicateDatasetNumbers,
    endpointTrimmedTrains,
    endpointTrimmedStops,
    missingSourceDeparture: candidates.filter(item => item.missingSourceDeparture).length,
    missingDestinationArrival: candidates.filter(item => item.missingDestinationArrival).length,
    invalidChronology: candidates.filter(item => item.invalidChronology).length,
  }
}

async function loadCandidates(connection, dataset) {
  const [stationRows] = await connection.query('SELECT station_id AS id, code FROM stations')
  const stationIds = new Map(
    stationRows.map(row => [String(row.code).trim().toUpperCase(), Number(row.id)]),
  )
  const [existingRows] = await connection.query(
    'SELECT train_id AS id, train_number AS number, train_name AS name FROM trains',
  )
  const existing = indexExisting(existingRows)

  return {
    ...prepareCandidates(dataset, stationIds, existing),
    databaseStationCount: stationRows.length,
    databaseTrainCount: existingRows.length,
  }
}

function createReport(datasetRecords, loaded, apply) {
  const newTrains = loaded.candidates.filter(item => !item.alreadyPresent && !item.conflict)
  const eligibleRouteStops = loaded.candidates.reduce((count, item) => count + item.train.route.length, 0)
  const eligibleRunningDayRows = loaded.candidates.reduce((count, item) => count + item.train.runningDays.length, 0)
  const report = {
    mode: apply ? 'APPLY' : 'DRY RUN',
    datasetRecords,
    eligibleTrains: loaded.candidates.length,
    invalidByReason: loaded.reasons,
    duplicateDatasetNumbers: loaded.duplicateDatasetNumbers,
    stationCodesAvailableForRoutes: loaded.stationCount,
    ...(apply ? {
      existingDatabaseStations: loaded.databaseStationCount,
      existingDatabaseTrains: loaded.databaseTrainCount,
      alreadyPresentAndPreserved: loaded.candidates.filter(item => item.alreadyPresent).length,
      conflictingExistingTrainNamesPreserved: loaded.candidates.filter(item => item.conflict).length,
      plannedNewTrains: newTrains.length,
    } : {
      databaseCompared: false,
      plannedNewTrains: null,
    }),
    trainsWhoseDeclaredEndpointsWereTrimmed: loaded.endpointTrimmedTrains,
    routeStopsTrimmedOutsideDeclaredEndpoints: loaded.endpointTrimmedStops,
    eligibleRouteStops,
    eligibleRunningDayRows,
    eligibleTrainsMissingSourceDeparture: loaded.missingSourceDeparture,
    eligibleTrainsMissingDestinationArrival: loaded.missingDestinationArrival,
    eligibleTrainsWithChronologyWarnings: loaded.invalidChronology,
    plannedRouteStops: apply ? newTrains.reduce((count, item) => count + item.train.route.length, 0) : null,
    plannedRunningDayRows: apply ? newTrains.reduce((count, item) => count + item.train.runningDays.length, 0) : null,
    insertedTrains: 0,
    insertedRouteStops: 0,
    insertedRunningDayRows: 0,
  }

  return { report, newTrains }
}

async function insertBatches(connection, sql, rows) {
  let affected = 0
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE)
    if (!batch.length) continue
    const [result] = await connection.query(sql, [batch])
    affected += Number(result.affectedRows || 0)
  }
  return affected
}

function sourceStationIds() {
  const stations = readStationDataset()
  return new Map(stations.valid.map(station => [station.code, null]))
}

async function importTrains({ apply = false } = {}) {
  const dataset = readDataset()

  if (!apply) {
    const stationIds = sourceStationIds()
    const loaded = prepareCandidates(dataset, stationIds)
    const { report } = createReport(dataset.length, loaded, false)
    console.log(JSON.stringify(report, null, 2))
    console.log('DRY RUN ONLY: source datasets were validated; no database connection or writes were made.')
    return report
  }

  assertDevelopmentTarget()
  const pool = require('../src/config/db')
  const connection = await pool.getConnection()

  try {
    const identity = await verifyDevelopmentConnection(connection)
    const loaded = await loadCandidates(connection, dataset)
    const { report, newTrains } = createReport(dataset.length, loaded, true)
    report.database = identity.databaseName
    report.mysqlVersion = identity.version

    const [migrationTables] = await connection.execute(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name = 'train_running_days'`,
    )
    if (!migrationTables.length) {
      throw new Error('Migration 006 is required before importing train running days.')
    }

    await connection.beginTransaction()
    try {
      report.insertedTrains = await insertBatches(
        connection,
        `INSERT IGNORE INTO trains (train_number, train_name, active)
         VALUES ?`,
        newTrains.map(item => [item.train.trainNumber, item.train.trainName, 1]),
      )

      const trainIds = new Map()
      for (let index = 0; index < newTrains.length; index += BATCH_SIZE) {
        const batch = newTrains.slice(index, index + BATCH_SIZE)
        const placeholders = batch.map(() => '?').join(',')
        const [rows] = await connection.execute(
          `SELECT train_id AS id, train_number AS number, train_name AS name
           FROM trains
           WHERE train_number IN (${placeholders})`,
          batch.map(item => item.train.trainNumber),
        )
        for (const row of rows) trainIds.set(String(row.number).toUpperCase(), row)
      }

      const routeRows = []
      const runningDayRows = []
      for (const item of newTrains) {
        const row = trainIds.get(item.train.trainNumber)
        if (!row || String(row.name).trim() !== item.train.trainName) {
          report.conflictingExistingTrainNamesPreserved += 1
          continue
        }

        for (const weekday of item.train.runningDays) {
          runningDayRows.push([row.id, weekday])
        }
        for (const stop of item.train.route) {
          routeRows.push([
            row.id,
            stop.stationId,
            stop.sequence,
            stop.arrivalTime,
            stop.departureTime,
            stop.dayOffset,
          ])
        }
      }

      report.insertedRunningDayRows = await insertBatches(
        connection,
        `INSERT IGNORE INTO train_running_days (train_id, weekday)
         VALUES ?`,
        runningDayRows,
      )
      report.insertedRouteStops = await insertBatches(
        connection,
        `INSERT IGNORE INTO route_stops
         (train_id, station_id, sequence_no, arrival_time, departure_time, day_offset)
         VALUES ?`,
        routeRows,
      )

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }

    console.log(JSON.stringify(report, null, 2))
    return report
  } finally {
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  importTrains({ apply: process.argv.includes('--apply') }).catch(error => {
    console.error('Train import failed:', error.message)
    process.exitCode = 1
  })
}

module.exports = {
  createReport,
  importTrains,
  loadCandidates,
  prepareCandidates,
  readDataset,
}
