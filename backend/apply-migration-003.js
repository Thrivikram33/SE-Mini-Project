require('dotenv').config({ path: '.env' });
const mysql = require('mysql2/promise');

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    await db.query(`
      ALTER TABLE passengers
      ADD UNIQUE KEY uq_passenger_booking_pair (booking_id, passenger_id)
    `);
    await db.query(`
      ALTER TABLE booking_seats
      ADD CONSTRAINT fk_booking_seat_booking_passenger
      FOREIGN KEY (booking_id, passenger_id)
      REFERENCES passengers (booking_id, passenger_id)
      ON DELETE RESTRICT
    `);
    console.log('Migration 003 applied successfully.');
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error('Migration 003 failed:', error.message);
  process.exitCode = 1;
});
