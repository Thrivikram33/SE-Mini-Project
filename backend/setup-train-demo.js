
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const mysql = require('mysql2/promise');

function getDemoDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const journeyDate = process.env.DEMO_JOURNEY_DATE || getDemoDate();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(journeyDate)) {
      throw new Error('DEMO_JOURNEY_DATE must use YYYY-MM-DD format.');
    }

    // Create or update the demo stations.
    await db.execute(`
      INSERT INTO stations (code, name, city)
      VALUES
        ('SBC', 'Bengaluru City Junction', 'Bengaluru'),
        ('MAS', 'Chennai Central', 'Chennai')
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        city = VALUES(city)
    `);

    // Create or update the demo train.
    await db.execute(`
      INSERT INTO trains (train_number, train_name, active)
      VALUES ('DEMO001', 'RRS Demo Express', TRUE)
      ON DUPLICATE KEY UPDATE
        train_name = VALUES(train_name),
        active = TRUE
    `);

    const [[source]] = await db.execute(
      'SELECT station_id FROM stations WHERE code = ?',
      ['SBC']
    );

    const [[destination]] = await db.execute(
      'SELECT station_id FROM stations WHERE code = ?',
      ['MAS']
    );

    const [[train]] = await db.execute(
      'SELECT train_id FROM trains WHERE train_number = ?',
      ['DEMO001']
    );

    if (!source || !destination || !train) {
      throw new Error('Could not retrieve demo master records.');
    }

    // Create the future journey schedule.
    await db.execute(`
      INSERT INTO schedules (train_id, journey_date, status)
      VALUES (?, ?, 'SCHEDULED')
      ON DUPLICATE KEY UPDATE status = 'SCHEDULED'
    `, [train.train_id, journeyDate]);

    const [[schedule]] = await db.execute(`
      SELECT schedule_id
      FROM schedules
      WHERE train_id = ? AND journey_date = ?
    `, [train.train_id, journeyDate]);

    // Configure the demo route.
    await db.execute(`
      INSERT INTO route_stops
        (train_id, station_id, sequence_no,
         arrival_time, departure_time, day_offset)
      VALUES
        (?, ?, 1, NULL, '20:00:00', 0),
        (?, ?, 2, '06:00:00', NULL, 1)
      ON DUPLICATE KEY UPDATE
        arrival_time = VALUES(arrival_time),
        departure_time = VALUES(departure_time),
        day_offset = VALUES(day_offset)
    `, [
      train.train_id,
      source.station_id,
      train.train_id,
      destination.station_id
    ]);

    // Create a sleeper coach.
    await db.execute(`
      INSERT INTO coaches (schedule_id, class_type, coach_number)
      VALUES (?, 'SL', 'S1')
      ON DUPLICATE KEY UPDATE class_type = 'SL'
    `, [schedule.schedule_id]);

    const [[coach]] = await db.execute(`
      SELECT coach_id
      FROM coaches
      WHERE schedule_id = ? AND coach_number = 'S1'
    `, [schedule.schedule_id]);

    // Configure the demo fare.
    await db.execute(`
      INSERT INTO fares (schedule_id, class_type, amount, currency)
      VALUES (?, 'SL', 450.00, 'INR')
      ON DUPLICATE KEY UPDATE
        amount = 450.00,
        currency = 'INR'
    `, [schedule.schedule_id]);

    // Add ten demo seats without duplicating existing seats.
    for (let i = 1; i <= 10; i++) {
      const berthTypes = ['LOWER', 'MIDDLE', 'UPPER'];

      await db.execute(`
        INSERT IGNORE INTO seats
          (coach_id, seat_number, berth_type, status)
        VALUES (?, ?, ?, 'AVAILABLE')
      `, [
        coach.coach_id,
        String(i),
        berthTypes[(i - 1) % berthTypes.length]
      ]);
    }

    console.log('\nDemo journey configured successfully.');
    console.log({
      train: 'DEMO001',
      route: 'SBC -> MAS',
      journeyDate,
      class: 'SL',
      coach: 'S1',
      fare: 'INR 450',
      seats: 10
    });

  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error('Demo setup failed:', error.message);
  process.exitCode = 1;
});
