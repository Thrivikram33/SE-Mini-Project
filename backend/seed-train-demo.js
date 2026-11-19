require('dotenv').config({ path: '.env' });
const mysql = require('mysql2/promise');

function getDemoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const journeyDate = process.env.DEMO_JOURNEY_DATE || getDemoDate();
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(journeyDate) || Number.isNaN(Date.parse(`${journeyDate}T00:00:00Z`))) {
      throw new Error('DEMO_JOURNEY_DATE must be a valid date in YYYY-MM-DD format.');
    }

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
      VALUES (?, ?, 'SCHEDULED')
      ON DUPLICATE KEY UPDATE status='SCHEDULED'
    `, [train.train_id, journeyDate]);

    const [[schedule]] = await db.query(
      "SELECT schedule_id FROM schedules WHERE train_id=? AND journey_date=?",
      [train.train_id, journeyDate]
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

    console.log('Demo journey seeded successfully: Bengaluru (SBC) → Chennai (MAS), ${journeyDate}.`);
  } finally {
    await db.end();
  }
})().catch(error => {
  console.error('Seeding failed:', error.message);
  process.exitCode = 1;
});
