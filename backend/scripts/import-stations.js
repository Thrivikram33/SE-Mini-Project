
require('dotenv').config()

const fs = require('fs')
const path = require('path')
const pool = require('../src/config/db')

const DATASET_PATH = path.resolve(__dirname, '../../stations.json')
const BATCH_SIZE = 250

function getCity(station) {
  const address = String(station.address || '').trim()
  const state = String(station.state || '').trim()

  if (!address) return state || station.name.trim()

  const parts = address.split(',').map(part => part.trim()).filter(Boolean)
  const city = parts.length > 1 && state && parts.at(-1).toLowerCase() === state.toLowerCase()
    ? parts.slice(0, -1).join(', ')
    : parts[0]

  return city || state || station.name.trim()
}

async function main() {
  const dataset = JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8'))

  const validStations = dataset.filter(station => {
    const code = String(station.code || '').trim()
    const name = String(station.name || '').trim()

    return code &&
      name &&
      code.length <= 10 &&
      name.length <= 120 &&
      !/^(XX|YY)-/i.test(code)
  })

  const connection = await pool.getConnection()

  let inserted = 0
  let existing = 0

  try {
    await connection.beginTransaction()

    for (let i = 0; i < validStations.length; i += BATCH_SIZE) {
      const batch = validStations.slice(i, i + BATCH_SIZE)

      for (const station of batch) {
        const code = String(station.code).trim().toUpperCase()
        const name = String(station.name).trim()
        const city = getCity(station)

        const [result] = await connection.execute(
          `INSERT INTO stations (code, name, city)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE code = VALUES(code)`,
          [code, name, city],
        )

        if (result.affectedRows === 1) inserted++
        else existing++
      }
    }

    await connection.commit()

    const [rows] = await connection.query(
      'SELECT COUNT(*) AS total FROM stations',
    )

    console.log({
      datasetRecords: dataset.length,
      eligibleRecords: validStations.length,
      inserted,
      existingOrSkipped: existing,
      totalDatabaseStations: rows[0].total,
    })
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('Station import failed:', error.message)
  process.exitCode = 1
})
