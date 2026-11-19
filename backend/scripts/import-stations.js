const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { normalizeStation } = require('./stationDataset')
const { assertDevelopmentTarget, verifyDevelopmentConnection } = require('./developmentDatabase')

const DATASET_PATH = path.resolve(__dirname, '../../stations.json')
const BATCH_SIZE = 500

function readDataset() {
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'))
  if (!Array.isArray(dataset)) throw new Error('stations.json must contain a JSON array.')

  const valid = []
  const reasons = {}
  const seenCodes = new Set()
  let duplicateCodes = 0
  let missingCity = 0

  for (const record of dataset) {
    const result = normalizeStation(record)
    if (result.reason) {
      reasons[result.reason] = (reasons[result.reason] || 0) + 1
      continue
    }

    if (seenCodes.has(result.station.code)) {
      duplicateCodes += 1
      continue
    }

    seenCodes.add(result.station.code)
    valid.push(result.station)
    if (result.missingCity) missingCity += 1
  }

  return { datasetRecords: dataset.length, valid, reasons, duplicateCodes, missingCity }
}

async function importStations({ apply = false } = {}) {
  const parsed = readDataset()
  const report = {
    mode: apply ? 'APPLY' : 'DRY RUN',
    datasetRecords: parsed.datasetRecords,
    eligibleRecords: parsed.valid.length,
    invalidRecords: parsed.datasetRecords - parsed.valid.length - parsed.duplicateCodes,
    invalidByReason: parsed.reasons,
    duplicateDatasetCodes: parsed.duplicateCodes,
    recordsWithoutAddressLocality: parsed.missingCity,
    databaseCompared: false,
    existingRecords: null,
    existingNameConflictsPreserved: null,
    insertedRecords: 0,
    datasetCodesPresentAfterImport: null,
    totalDatabaseStations: null,
  }

  if (!apply) {
    console.log(JSON.stringify(report, null, 2))
    console.log('DRY RUN ONLY: no database connection or writes were made.')
    return report
  }

  assertDevelopmentTarget()
  const pool = require('../src/config/db')
  const connection = await pool.getConnection()

  try {
    const identity = await verifyDevelopmentConnection(connection)
    const [stationTables] = await connection.execute(
      `SELECT engine AS engine
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'stations'`,
    )
    if (!stationTables.length || stationTables[0].engine !== 'InnoDB') {
      throw new Error('Expected InnoDB stations table is missing from the confirmed development database.')
    }

    const [existingRows] = await connection.query('SELECT code, name, city FROM stations')
    report.database = identity.databaseName
    report.mysqlVersion = identity.version
    report.databaseCompared = true
    report.existingRecords = existingRows.length
    report.existingNameConflictsPreserved = 0
    const existingByCode = new Map(
      existingRows.map(row => [String(row.code).toUpperCase(), row]),
    )
    const toInsert = []

    for (const station of parsed.valid) {
      const existing = existingByCode.get(station.code)
      if (!existing) {
        toInsert.push(station)
      } else {
        if (existing.name.trim() !== station.name) {
          report.existingNameConflictsPreserved += 1
        }
      }
    }

    await connection.beginTransaction()
    try {
      for (let index = 0; index < toInsert.length; index += BATCH_SIZE) {
        const batch = toInsert.slice(index, index + BATCH_SIZE)
        const [result] = await connection.query(
          `INSERT IGNORE INTO stations (code, name, city)
           VALUES ?`,
          [batch.map(station => [station.code, station.name, station.city])],
        )
        report.insertedRecords += Number(result.affectedRows || 0)
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }

    const [databaseRows] = await connection.query('SELECT code FROM stations')
    const databaseCodes = new Set(databaseRows.map(row => String(row.code).toUpperCase()))
    report.datasetCodesPresentAfterImport = parsed.valid.filter(
      station => databaseCodes.has(station.code),
    ).length
    report.totalDatabaseStations = databaseRows.length

    console.log(JSON.stringify(report, null, 2))
    return report
  } finally {
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  importStations({ apply: process.argv.includes('--apply') }).catch(error => {
    console.error('Station import failed:', error.message)
    process.exitCode = 1
  })
}

module.exports = {
  importStations,
  readDataset,
  requireDevelopmentTarget: assertDevelopmentTarget,
}
