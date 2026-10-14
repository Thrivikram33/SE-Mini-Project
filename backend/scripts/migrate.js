import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/db.js'

const migration = '001_initial_schema.sql'
const path = new URL(`../db/migrations/${migration}`, import.meta.url)
const sql = await readFile(fileURLToPath(path), 'utf8')
const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean)
const config = loadConfig()
if (config.nodeEnv !== 'development' || config.mysql.database !== 'railway_reservation_dev') {
  throw new Error('Migration is restricted to NODE_ENV=development and MYSQL_DATABASE=railway_reservation_dev.')
}
const db = createDatabase(config)

try {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(190) NOT NULL PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
  const [applied] = await db.execute('SELECT version FROM schema_migrations WHERE version = ?', [migration])
  if (applied.length) {
    console.log(`${migration} already applied; no changes made.`)
  } else {
    for (const statement of statements) await db.query(statement)
    await db.execute('INSERT INTO schema_migrations (version) VALUES (?)', [migration])
    console.log(`Applied ${migration}.`)
  }
} finally {
  await db.end()
}
