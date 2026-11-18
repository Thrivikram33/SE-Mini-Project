const pool = require('./src/config/db');

async function main() {
  const sql = `
    SELECT
      COUNT(DISTINCT a.train_id) AS matchingRouteTrains,
      COUNT(DISTINCT CASE
        WHEN d.train_id IS NOT NULL THEN a.train_id
      END) AS operatingOnThursday
    FROM route_stops a
    JOIN stations x ON x.station_id = a.station_id
    JOIN route_stops b
      ON b.train_id = a.train_id
      AND b.sequence_no > a.sequence_no
    JOIN stations y ON y.station_id = b.station_id
    LEFT JOIN train_running_days d
      ON d.train_id = a.train_id
      AND d.weekday = 4
    WHERE x.code = ?
      AND y.code = ?
  `;

  try {
    const [rows] = await pool.query(sql, ['SBC', 'MYS']);
    console.log(rows[0]);
  } catch (error) {
    console.error(error.message);
  } finally {
    await pool.end();
  }
}

main();