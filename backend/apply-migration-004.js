require('dotenv').config({ path: require('node:path').resolve(__dirname, '.env') })
const mysql = require('mysql2/promise')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../database/migrations/004_booking_journey_details.sql'),
    'utf8'
  )

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  })

  try {
    await db.query(sql)
    console.log('Migration 004 applied successfully.')
  } finally {
    await db.end()
  }
}

main().catch(error => {
  console.error('Migration 004 failed:', error.message)
  process.exitCode = 1
})
