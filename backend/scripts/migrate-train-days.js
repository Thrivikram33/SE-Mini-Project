const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { assertDevelopmentTarget, verifyDevelopmentConnection } = require('./developmentDatabase')

async function migrateTrainRunningDays() {
  assertDevelopmentTarget()
  const pool = require('../src/config/db')
  const connection = await pool.getConnection()

  try {
    const identity = await verifyDevelopmentConnection(connection)
    const [baseTables] = await connection.execute(
      `SELECT table_name AS name, engine AS engine
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_name IN ('trains', 'stations', 'route_stops')`,
    )
    const baseByName = new Map(baseTables.map(table => [table.name, table]))
    const missingBase = ['trains', 'stations', 'route_stops'].filter(name => !baseByName.has(name))
    if (missingBase.length) {
      throw new Error(`Required project tables are missing: ${missingBase.join(', ')}. Apply the base migrations first.`)
    }
    if (baseTables.some(table => table.engine !== 'InnoDB')) {
      throw new Error('Expected InnoDB base tables; migration was not applied.')
    }

    const migrationPath = path.resolve(__dirname, '../../database/migrations/006_train_running_days.sql')
    const migration = fs.readFileSync(migrationPath, 'utf8')
      .replace(/^\s*--.*$/gm, '')
      .trim()
    if (!/^CREATE\s+TABLE\s+train_running_days\b/i.test(migration)) {
      throw new Error('Migration 006 has an unexpected shape; no changes were applied.')
    }

    const [existingRows] = await connection.execute(
      `SELECT engine AS engine
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'train_running_days'`,
    )
    let applied = false
    if (!existingRows.length) {
      await connection.query(migration)
      applied = true
    } else if (existingRows[0].engine !== 'InnoDB') {
      throw new Error('Existing train_running_days table is not InnoDB; inspect it manually. No changes were applied.')
    }

    const [columns] = await connection.execute(
      `SELECT column_name AS name, column_type AS type, is_nullable AS nullable
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'train_running_days'`,
    )
    const columnByName = new Map(columns.map(column => [column.name, column]))
    if (!columnByName.has('train_id') || !columnByName.has('weekday')) {
      throw new Error('Existing train_running_days table does not match migration 006. Inspect it manually.')
    }
    const [foreignKeys] = await connection.execute(
      `SELECT referenced_table_name AS referencedTable
       FROM information_schema.key_column_usage
       WHERE table_schema = DATABASE() AND table_name = 'train_running_days'
         AND constraint_name = 'fk_train_running_days_train'
         AND column_name = 'train_id'`,
    )
    if (foreignKeys.length !== 1 || foreignKeys[0].referencedTable !== 'trains') {
      throw new Error('train_running_days is missing the expected train foreign key. Inspect it manually.')
    }

    console.log(JSON.stringify({
      result: applied ? 'APPLIED' : 'ALREADY PRESENT',
      database: identity.databaseName,
      mysqlVersion: identity.version,
      table: 'train_running_days',
      operation: 'additive table creation only',
    }, null, 2))
  } finally {
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  migrateTrainRunningDays().catch(error => {
    console.error('Train weekday migration failed:', error.message)
    process.exitCode = 1
  })
}

module.exports = { migrateTrainRunningDays }
