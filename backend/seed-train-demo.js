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
      INSERT INTO stations (code, name, city)
      VALUES ('SBC', 'Bengaluru City Junction', 'Bengaluru'),
             ('MAS', 'Chennai Central', 'Chennai')
      ON DUPLICATE KEY UPDATE name = VALUES(name), city = VALUES(city)
    `);

    await db.query(`
      INSERT INTO trains (train_number, train_name, active)
      VALUES ('DEMO001', 'RRS Demo Express', TRUE)
      ON DUPLICATE KEY UPDATE train_name = VALUES(train_name), active = TRUE
    `);

    const [[src]] = await db.query("SELECT station_id FROM stations WHERE code='SBC'");
    const [[dst]] = await db.query("SELECT station_id FROM stations WHERE code='MAS'");
    const [[train]] = await db.query("SELECT train_id FROM trains WHERE train_number='DEMO001'");

    await db.query(`
      INSERT INTO schedules (train_id, journey_date, status)
      VALUES (?, '2026-11-10', 'SCHEDULED')
      ON DUPLICATE KEY UPDATE status='SCHEDULED'
    `, [train.train_id]);

    const [[schedule]] = await db.query(
      "SELECT schedule_id FROM schedules WHERE train_id=? AND journey_date='2026-11-10'",
      [train.train_id]
    );

    await db.query(`
      INSERT INTO route_stops
        (train_id, station_id, sequence_no, arrival_time, departure_time, day_offset)
      VALUES (?, ?, 1, NULL, '20:00:00', 0),
             (?, ?, 2, '06:00:00', NULL, 1)
      ON DUPLICATE KEY UPDATE
        arrival_time=VALUES(arrival_time),
        departure_time=VALUES(departure_time),
        day_offset=VALUES(day_offset)
    `, [train.train_id, src.station_id, train.train_id, dst.station_id]);

    await db.query(`
      INSERT INTO coaches (schedule_id, class_type, coach_number)
      VALUES (?, 'SL', 'S1')
      ON DUPLICATE KEY UPDATE class_type='SL'
    `, [schedule.schedule_id]);

    const [[coach]] = await db.query(
      "SELECT coach_id FROM coaches WHERE schedule_id=? AND coach_number='S1'",
      [schedule.schedule_id]
    );

    await db.query(`
      INSERT INTO fares (schedule_id, class_type, amount, currency)
      VALUES (?, 'SL', 450.00, 'INR')
      ON DUPLICATE KEY UPDATE amount=450.00, currency='INR'
    `, [schedule.schedule_id]);

    for (let i = 1; i <= 10; i++) {
      await db.query(
        "INSERT IGNORE INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, ?, ?, 'AVAILABLE')",
        [coach.coach_id, String(i), ['LOWER', 'MIDDLE', 'UPPER'][(i - 1) % 3]]
      );
    }

    console.log('Demo journey seeded successfully: Bengaluru (SBC) → Chennai (MAS), 10 November 2026.');
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error('Seeding failed:', error.message);
  process.exitCode = 1;
});
