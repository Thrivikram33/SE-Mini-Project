const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const mysql = require('mysql2/promise');
const demoData = require('./demo-data.json');
const ALLOWED_CLASSES = new Set(['1A', '2A', '3A', 'SL', 'CC', '2S']);

function getTomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateDemoData(data) {
  if (!Array.isArray(data.stations) || !Array.isArray(data.trains) || data.stations.length < 2 || data.trains.length < 1) {
    throw new Error('Demo data must contain stations and at least one train.');
  }
  const stationCodes = new Set(data.stations.map(station => station.code));
  const trainNumbers = new Set();
  for (const train of data.trains) {
    if (!train.number || !train.name || trainNumbers.has(train.number)) throw new Error(`Invalid or duplicate demo train number: ${train.number}`);
    trainNumbers.add(train.number);
    if (!stationCodes.has(train.source) || !stationCodes.has(train.destination) || train.source === train.destination) throw new Error(`Train ${train.number} references an invalid route.`);
    if (!Array.isArray(train.classes) || train.classes.length === 0) throw new Error(`Train ${train.number} must have at least one class.`);
    for (const item of train.classes) {
      if (!ALLOWED_CLASSES.has(item.type) || !item.coach || !Number.isFinite(item.fare) || item.fare < 0 || !Number.isInteger(item.seats) || item.seats < 1 || item.seats > 100) throw new Error(`Invalid class/coach/fare/seat data for ${train.number}.`);
    }
  }
}

function berthFor(classType, seatNumber) {
  if (classType === 'CC' || classType === '2S') return 'SEAT';
  if (classType === '1A') return 'LOWER';
  return ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'][(seatNumber - 1) % 5];
}

async function main() {
  validateDemoData(demoData);
  const journeyDate = process.env.DEMO_JOURNEY_DATE || getTomorrowDate();
  if (!isValidDate(journeyDate) || journeyDate < new Date().toISOString().slice(0, 10)) throw new Error('DEMO_JOURNEY_DATE must be a valid date today or later (YYYY-MM-DD).');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    await db.beginTransaction();
    for (const station of demoData.stations) {
      await db.execute('INSERT INTO stations (code, name, city) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), city = VALUES(city)', [station.code, station.name, station.city]);
    }
    const [stationRows] = await db.execute('SELECT station_id, code FROM stations WHERE code IN (' + demoData.stations.map(() => '?').join(',') + ')', demoData.stations.map(station => station.code));
    const stationIds = new Map(stationRows.map(row => [row.code, row.station_id]));
    for (const train of demoData.trains) {
      await db.execute('INSERT INTO trains (train_number, train_name, active) VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE train_name = VALUES(train_name), active = TRUE', [train.number, train.name]);
      const [[trainRow]] = await db.execute('SELECT train_id FROM trains WHERE train_number = ?', [train.number]);
      if (!trainRow) throw new Error(`Could not load train ${train.number}.`);
      await db.execute('INSERT INTO schedules (train_id, journey_date, status) VALUES (?, ?, \'SCHEDULED\') ON DUPLICATE KEY UPDATE status = \'SCHEDULED\'', [trainRow.train_id, journeyDate]);
      const [[schedule]] = await db.execute('SELECT schedule_id FROM schedules WHERE train_id = ? AND journey_date = ?', [trainRow.train_id, journeyDate]);
      await db.execute('INSERT INTO route_stops (train_id, station_id, sequence_no, arrival_time, departure_time, day_offset) VALUES (?, ?, 1, NULL, ?, 0), (?, ?, 2, ?, NULL, ?) ON DUPLICATE KEY UPDATE arrival_time = VALUES(arrival_time), departure_time = VALUES(departure_time), day_offset = VALUES(day_offset)', [trainRow.train_id, stationIds.get(train.source), train.departure, trainRow.train_id, stationIds.get(train.destination), train.arrival, train.arrivalDayOffset]);
      for (const item of train.classes) {
        await db.execute('INSERT INTO coaches (schedule_id, class_type, coach_number) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE class_type = VALUES(class_type)', [schedule.schedule_id, item.type, item.coach]);
        const [[coach]] = await db.execute('SELECT coach_id FROM coaches WHERE schedule_id = ? AND coach_number = ?', [schedule.schedule_id, item.coach]);
        await db.execute('INSERT INTO fares (schedule_id, class_type, amount, currency) VALUES (?, ?, ?, \'INR\') ON DUPLICATE KEY UPDATE amount = VALUES(amount), currency = VALUES(currency)', [schedule.schedule_id, item.type, item.fare]);
        for (let seat = 1; seat <= item.seats; seat += 1) {
          const berth = item.type === 'CC' || item.type === '2S' ? 'SEAT' : item.type === '1A' ? 'LOWER' : ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'][(seat - 1) % 5];
          await db.execute('INSERT IGNORE INTO seats (coach_id, seat_number, berth_type, status) VALUES (?, ?, ?, \'AVAILABLE\')', [coach.coach_id, String(seat), berth]);
        }
      }
    }
    await db.commit();
    console.log('Fictional RRS demo data seeded successfully.');
    console.log(`Journey date: ${journeyDate}`);
    console.log(`Stations: ${demoData.stations.length}; trains: ${demoData.trains.length}; classes: ${demoData.trains.reduce((sum, train) => sum + train.classes.length, 0)}`);
    console.log('Sample routes: SBC -> MAS, SBC -> MYS, MAS -> SBC, SBC -> HYB');
    console.log('These records are placeholders for project demonstrations, not official railway data.');
  } catch (error) { await db.rollback(); throw error; }
  finally { await db.end(); }
}

if (require.main === module) {
  main().catch(error => { console.error('Demo setup failed:', error.message); process.exitCode = 1; });
}

module.exports = { validateDemoData, isValidDate, demoData };