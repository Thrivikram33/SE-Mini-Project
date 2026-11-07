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
    const [rows] = await db.query(`
      SELECT s.name AS station, s.code, t.train_number, t.train_name
      FROM stations s
      LEFT JOIN route_stops rs ON rs.station_id = s.station_id
      LEFT JOIN trains t ON t.train_id = rs.train_id
      ORDER BY t.train_number, rs.sequence_no
    `);
    console.table(rows);
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
