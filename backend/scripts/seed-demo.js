import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/db.js'

const config = loadConfig()
if (config.nodeEnv !== 'development' || config.mysql.database !== 'railway_reservation_dev' || process.env.DEMO_SEED_ENABLED !== '1') {
  throw new Error('Demo seed is restricted to railway_reservation_dev with NODE_ENV=development and DEMO_SEED_ENABLED=1.')
}

const seedUrl = new URL('../db/seeds/demo.sql', import.meta.url)
const sql = await readFile(fileURLToPath(seedUrl), 'utf8')
const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean)
const db = createDatabase(config)
try {
  for (const statement of statements) await db.query(statement)
  console.log('Fictional local demonstration data loaded.')
} finally {
  await db.end()
}
