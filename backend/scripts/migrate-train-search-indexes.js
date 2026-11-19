const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { assertDevelopmentTarget, verifyDevelopmentConnection } = require('./developmentDatabase')

async function migrateTrainSearchIndexes() {
  assertDevelopmentTarget()
  const migrationPath = path.resolve(__dirname, '../../database/migrations/005_train_search_performance_indexes.sql')
  const migration = fs.readFileSync(migrationPath, 'utf8').replace(/^\s*--.*$/gm, '')
  const indexDefinitions = [
    {
      table: 'stations',
      name: 'idx_stations_name',
      sql: 'ALTER TABLE stations ADD KEY idx_stations_name (name)',
    },
    {
      table: 'route_stops',
      name: 'idx_route_station_train_sequence_departure',
      sql: `ALTER TABLE route_stops
            ADD KEY idx_route_station_train_sequence_departure
            (station_id, train_id, sequence_no, departure_time, day_offset)`,
    },
  ]
  for (const index of indexDefinitions) {
    if (!migration.includes(index.name)) throw new Error(`Migration 005 is missing ${index.name}; no changes were applied.`)
  }

  const pool = require('../src/config/db')
  const connection = await pool.getConnection()
  try {
    const identity = await verifyDevelopmentConnection(connection)
    const [tables] = await connection.execute(
      `SELECT table_name AS name, engine AS engine
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name IN ('stations', 'route_stops')`,
    )
    const tableByName = new Map(tables.map(table => [table.name, table]))
    if (!tableByName.has('stations') || !tableByName.has('route_stops')) {
      throw new Error('Migrations 001 and 004 are required before migration 005. No changes were applied.')
    }
    if (tables.some(table => table.engine !== 'InnoDB')) {
      throw new Error('Migration 005 requires InnoDB tables. No changes were applied.')
    }

    const applied = []
    const alreadyPresent = []
    for (const index of indexDefinitions) {
      const [[row]] = await connection.execute(
        `SELECT COUNT(*) AS count
         FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        [index.table, index.name],
      )
      if (Number(row.count) > 0) {
        alreadyPresent.push(index.name)
      } else {
        await connection.query(index.sql)
        applied.push(index.name)
      }
    }

    console.log(JSON.stringify({
      database: identity.databaseName,
      mysqlVersion: identity.version,
      applied,
      alreadyPresent,
    }, null, 2))
  } finally {
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  migrateTrainSearchIndexes().catch(error => {
    console.error('Train-search index migration failed:', error.message)
    process.exitCode = 1
  })
}

module.exports = { migrateTrainSearchIndexes }
