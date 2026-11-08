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
    await db.query('ALTER TABLE bookings MODIFY COLUMN pnr CHAR(12) NULL');
    console.log('Migration 002 applied successfully.');
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error('Migration 002 failed:', error.message);
  process.exitCode = 1;
});
