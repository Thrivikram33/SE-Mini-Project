const fs = require('node:fs')
const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { assertDevelopmentTarget, verifyDevelopmentConnection } = require('./developmentDatabase')

function readInitialSchema() {
  const migrationPath = path.resolve(__dirname, '../../database/migrations/001_initial_schema.sql')
  const source = fs.readFileSync(migrationPath, 'utf8').replace(/^\s*--.*$/gm, '')
  const withoutHardcodedDatabase = source.replace(/^\s*USE\s+railway_reservation\s*;\s*/i, '')
  if (withoutHardcodedDatabase === source) {
    throw new Error('Migration 001 did not contain the expected database selector; refusing to guess its target.')
  }
  const statements = withoutHardcodedDatabase.split(';').map(statement => statement.trim()).filter(Boolean)
  const tableNames = statements.map(statement => {
    const match = statement.match(/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-z_]+)\s*\(/i)
    if (!match) throw new Error('Migration 001 contains an unexpected statement; no changes were applied.')
    return match[1]
  })
  if (tableNames.length !== 14 || new Set(tableNames).size !== tableNames.length) {
    throw new Error(`Migration 001 has an unexpected table count (${tableNames.length}); no changes were applied.`)
  }
  return { statements, tableNames }
}

async function migrateInitialSchema() {
  assertDevelopmentTarget()
  const { statements, tableNames } = readInitialSchema()
  const pool = require('../src/config/db')
  const connection = await pool.getConnection()

  try {
    const identity = await verifyDevelopmentConnection(connection)
    const [existingTables] = await connection.execute(
      `SELECT table_name AS name, engine AS engine
       FROM information_schema.tables
       WHERE table_schema = DATABASE()`,
    )
    const expectedSet = new Set(tableNames)
    const unexpectedTables = existingTables.filter(table => !expectedSet.has(table.name))
    if (unexpectedTables.length) {
      throw new Error(`Refusing migration 001: unexpected tables exist (${unexpectedTables.map(table => table.name).join(', ')}). No changes were applied.`)
    }
    if (existingTables.some(table => table.engine !== 'InnoDB')) {
      throw new Error('Refusing migration 001: an existing schema table is not InnoDB. No changes were applied.')
    }
    for (const table of existingTables) {
      const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM \`${table.name}\``)
      if (Number(row.count) > 0) {
        throw new Error(`Refusing migration 001: existing table ${table.name} contains data. No changes were applied.`)
      }
    }

    for (const statement of statements) await connection.query(statement)

    const [createdTables] = await connection.execute(
      `SELECT table_name AS name, engine AS engine
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
       ORDER BY table_name`,
    )
    const actualNames = createdTables.map(table => table.name)
    const expectedNames = [...tableNames].sort()
    const matches = JSON.stringify(actualNames) === JSON.stringify(expectedNames)
    const allInnoDB = createdTables.every(table => table.engine === 'InnoDB')
    if (!matches || !allInnoDB) {
      throw new Error('Migration 001 finished with an unexpected table set or engine. Inspect the development schema before retrying.')
    }

    console.log(JSON.stringify({
      result: existingTables.length === 0
        ? 'APPLIED'
        : createdTables.length === existingTables.length ? 'ALREADY PRESENT' : 'RESUMED',
      database: identity.databaseName,
      mysqlVersion: identity.version,
      createdTables: createdTables.length,
      createdTablesThisRun: createdTables.length - existingTables.length,
      rowDataInserted: false,
    }, null, 2))
  } finally {
    connection.release()
    await pool.end()
  }
}

if (require.main === module) {
  migrateInitialSchema().catch(error => {
    console.error('Initial schema migration failed:', error.message)
    process.exitCode = 1
  })
}

module.exports = { migrateInitialSchema, readInitialSchema }
