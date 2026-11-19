const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const pool = require('../src/config/db')

async function columnExists(connection, table, column) {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [table, column],
  )
  return Number(row.count) > 0
}

async function constraintExists(connection, table, name) {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE() AND table_name = ? AND constraint_name = ?`,
    [table, name],
  )
  return Number(row.count) > 0
}

async function indexExists(connection, table, name) {
  const [[row]] = await connection.execute(
    `SELECT COUNT(*) AS count
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    [table, name],
  )
  return Number(row.count) > 0
}

async function main() {
  const connection = await pool.getConnection()
  try {
    const [[database]] = await connection.query('SELECT DATABASE() AS name')
    if (database.name !== 'railway_reservation') {
      throw new Error(`Refusing to migrate unexpected database "${database.name}". Expected "railway_reservation".`)
    }

    const requiredTables = ['bookings', 'passengers', 'booking_seats', 'stations']
    const [tables] = await connection.execute(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name IN (?, ?, ?, ?)`,
      requiredTables,
    )
    const found = new Set(tables.map((row) => row.name))
    const missing = requiredTables.filter((name) => !found.has(name))
    if (missing.length) throw new Error(`Required base-schema tables are missing: ${missing.join(', ')}. Apply migration 001 first.`)

    const [[pnr]] = await connection.execute(
      `SELECT is_nullable AS nullable
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'bookings' AND column_name = 'pnr'`,
    )
    if (!pnr) throw new Error('bookings.pnr is missing. Apply migration 001 first.')
    if (pnr.nullable !== 'YES') {
      await connection.query('ALTER TABLE bookings MODIFY COLUMN pnr CHAR(12) NULL')
      console.log('Applied migration 002: nullable PNR for failed payment records.')
    } else {
      console.log('Migration 002 already applied.')
    }

    const hasPairIndex = await indexExists(connection, 'passengers', 'uq_passenger_booking_pair')
    const hasPairForeignKey = await constraintExists(connection, 'booking_seats', 'fk_booking_seat_booking_passenger')
    if (!hasPairIndex && !hasPairForeignKey) {
      const [[badPairs]] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM booking_seats bs
         LEFT JOIN passengers p
           ON p.booking_id = bs.booking_id AND p.passenger_id = bs.passenger_id
         WHERE p.passenger_id IS NULL`,
      )
      if (Number(badPairs.count) > 0) {
        throw new Error(`Migration 003 preflight found ${badPairs.count} booking_seats rows linked to a passenger from another booking or a missing passenger. No migration 003 changes were applied.`)
      }
      await connection.query(
        'ALTER TABLE passengers ADD UNIQUE KEY uq_passenger_booking_pair (booking_id, passenger_id)',
      )
      await connection.query(
        `ALTER TABLE booking_seats
         ADD CONSTRAINT fk_booking_seat_booking_passenger
         FOREIGN KEY (booking_id, passenger_id)
         REFERENCES passengers (booking_id, passenger_id)
         ON DELETE RESTRICT`,
      )
      console.log('Applied migration 003: booking/passenger allocation integrity.')
    } else if (hasPairIndex && hasPairForeignKey) {
      console.log('Migration 003 already applied.')
    } else {
      throw new Error('Migration 003 is partially applied. Inspect its index and foreign key before continuing; no automatic repair was attempted.')
    }

    const journeyColumns = ['origin_station_id', 'destination_station_id', 'class_type']
    const columnStates = await Promise.all(journeyColumns.map((name) => columnExists(connection, 'bookings', name)))
    const originFk = await constraintExists(connection, 'bookings', 'fk_booking_origin_station')
    const destinationFk = await constraintExists(connection, 'bookings', 'fk_booking_destination_station')
    const objectCount = columnStates.filter(Boolean).length + Number(originFk) + Number(destinationFk)
    if (objectCount === 0) {
      await connection.query(
        `ALTER TABLE bookings
         ADD COLUMN origin_station_id BIGINT UNSIGNED NULL AFTER schedule_id,
         ADD COLUMN destination_station_id BIGINT UNSIGNED NULL AFTER origin_station_id,
         ADD COLUMN class_type ENUM('1A', '2A', '3A', 'SL', 'CC', '2S') NULL AFTER destination_station_id,
         ADD CONSTRAINT fk_booking_origin_station
           FOREIGN KEY (origin_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT,
         ADD CONSTRAINT fk_booking_destination_station
           FOREIGN KEY (destination_station_id) REFERENCES stations(station_id) ON DELETE RESTRICT`,
      )
      console.log('Applied migration 004: booking journey and class details.')
    } else if (objectCount === 5) {
      console.log('Migration 004 already applied.')
    } else {
      throw new Error('Migration 004 is partially applied. Inspect bookings columns and station foreign keys before continuing; no automatic repair was attempted.')
    }

    console.log('Booking schema migration checks completed successfully.')
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Booking schema migration failed:', error.message)
  process.exitCode = 1
})
