
/**
 * Create demo schedules and bookable Sleeper inventory for imported trains.
 *
 * Uses imported route timings and train_running_days; it does NOT invent train
 * departure/arrival times. Fares are illustrative project-demo values, not
 * official railway fares. Creates a rolling 30-day schedule window.
 *
 * Safe to rerun: existing schedules, coaches, fares and seats are preserved.
 *
 * Run from backend:
 *   node scripts/generate-imported-schedules.js
 */
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/db');

const HORIZON_DAYS = 30;
const SEATS_PER_COACH = 10;
const COACH_NUMBER = 'S1';
const CLASS_TYPE = 'SL';
const CURRENCY = 'INR';
const INSERT_CHUNK_SIZE = 500;

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function minutes(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) {
    return null;
  }
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function demoFare(durationMinutes) {
  // Illustrative fare for this simulated project inventory only.
  return Math.max(50, Math.round(100 + durationMinutes * 0.5));
}

async function insertChunks(connection, sql, rows) {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    if (chunk.length) await connection.query(sql, [chunk]);
  }
}

async function main() {
  const connection = await pool.getConnection();

  try {
    const [trainRows] = await connection.query(`
      SELECT
        t.train_id AS trainId,
        t.train_number AS trainNumber,
        rs.sequence_no AS sequenceNo,
        rs.arrival_time AS arrivalTime,
        rs.departure_time AS departureTime,
        rs.day_offset AS dayOffset,
        d.weekday AS weekday
      FROM trains t
      JOIN train_running_days d ON d.train_id = t.train_id
      JOIN route_stops rs ON rs.train_id = t.train_id
      WHERE t.active = TRUE
      ORDER BY t.train_id, rs.sequence_no
    `);

    const trains = new Map();

    for (const row of trainRows) {
      if (!trains.has(row.trainId)) {
        trains.set(row.trainId, {
          trainId: Number(row.trainId),
          trainNumber: row.trainNumber,
          days: new Set(),
          stops: [],
        });
      }

      const train = trains.get(row.trainId);
      train.days.add(Number(row.weekday));

      if (
        !train.stops.length ||
        train.stops[train.stops.length - 1].sequenceNo !== Number(row.sequenceNo)
      ) {
        train.stops.push({
          sequenceNo: Number(row.sequenceNo),
          arrivalTime: row.arrivalTime,
          departureTime: row.departureTime,
          dayOffset: Number(row.dayOffset),
        });
      }
    }

    const eligible = [];
    const skipped = [];

    for (const train of trains.values()) {
      if (train.stops.length < 2) {
        skipped.push(train.trainNumber);
        continue;
      }

      const departureStop = train.stops.find(
        (stop) => minutes(stop.departureTime) !== null
      );

      const departure = minutes(
        departureStop && departureStop.departureTime
      );

      const arrivalStop = [...train.stops].reverse().find((stop) => {
        const arrival = minutes(stop.arrivalTime);

        if (arrival === null || !departureStop) return false;

        const elapsed =
          (stop.dayOffset - departureStop.dayOffset) * 1440 +
          arrival -
          departure;

        return elapsed > 0;
      });

      const arrival = minutes(
        arrivalStop && arrivalStop.arrivalTime
      );

      if (!departureStop || !arrivalStop || arrival === null) {
        skipped.push(train.trainNumber);
        continue;
      }

      const durationMinutes =
        (arrivalStop.dayOffset - departureStop.dayOffset) * 1440 +
        arrival -
        departure;

      eligible.push({
        ...train,
        durationMinutes,
        fareAmount: demoFare(durationMinutes),
      });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setUTCDate(
      endDate.getUTCDate() + HORIZON_DAYS - 1
    );

    const start = dateString(today);
    const end = dateString(endDate);

    const scheduleRows = [];

    for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() + offset);

      const weekday = date.getUTCDay();
      const journeyDate = dateString(date);

      for (const train of eligible) {
        if (train.days.has(weekday)) {
          scheduleRows.push([
            train.trainId,
            journeyDate,
            'SCHEDULED',
          ]);
        }
      }
    }

    await insertChunks(
      connection,
      'INSERT IGNORE INTO schedules (train_id, journey_date, status) VALUES ?',
      scheduleRows
    );

    const trainIds = eligible.map((train) => train.trainId);
    let schedules = [];

    for (
      let index = 0;
      index < trainIds.length;
      index += INSERT_CHUNK_SIZE
    ) {
      const ids = trainIds.slice(
        index,
        index + INSERT_CHUNK_SIZE
      );

      if (!ids.length) continue;

      const placeholders = ids.map(() => '?').join(',');

      const [rows] = await connection.execute(
        `SELECT schedule_id AS scheduleId, train_id AS trainId
         FROM schedules
         WHERE train_id IN (${placeholders})
           AND journey_date BETWEEN ? AND ?
           AND status = 'SCHEDULED'`,
        [...ids, start, end]
      );

      schedules = schedules.concat(rows);
    }

    const coachRows = schedules.map((schedule) => [
      schedule.scheduleId,
      CLASS_TYPE,
      COACH_NUMBER,
    ]);

    await insertChunks(
      connection,
      'INSERT IGNORE INTO coaches (schedule_id, class_type, coach_number) VALUES ?',
      coachRows
    );

    const fareByTrain = new Map(
      eligible.map((train) => [
        train.trainId,
        train.fareAmount,
      ])
    );

    const fareRows = schedules.map((schedule) => [
      schedule.scheduleId,
      CLASS_TYPE,
      fareByTrain.get(Number(schedule.trainId)),
      CURRENCY,
    ]);

    await insertChunks(
      connection,
      'INSERT IGNORE INTO fares (schedule_id, class_type, amount, currency) VALUES ?',
      fareRows
    );

    const scheduleIds = schedules.map(
      (schedule) => Number(schedule.scheduleId)
    );

    const seatRows = [];

    for (
      let index = 0;
      index < scheduleIds.length;
      index += INSERT_CHUNK_SIZE
    ) {
      const ids = scheduleIds.slice(
        index,
        index + INSERT_CHUNK_SIZE
      );

      if (!ids.length) continue;

      const placeholders = ids.map(() => '?').join(',');

      const [coaches] = await connection.execute(
        `SELECT coach_id AS coachId
         FROM coaches
         WHERE schedule_id IN (${placeholders})
           AND class_type = ?
           AND coach_number = ?`,
        [...ids, CLASS_TYPE, COACH_NUMBER]
      );

      for (const coach of coaches) {
        for (let seat = 1; seat <= SEATS_PER_COACH; seat += 1) {
          const berth = [
            'LOWER',
            'MIDDLE',
            'UPPER',
            'SIDE_LOWER',
            'SIDE_UPPER',
          ][(seat - 1) % 5];

          seatRows.push([
            coach.coachId,
            String(seat),
            berth,
            'AVAILABLE',
          ]);
        }
      }
    }

    await insertChunks(
      connection,
      'INSERT IGNORE INTO seats (coach_id, seat_number, berth_type, status) VALUES ?',
      seatRows
    );

    console.log(
      JSON.stringify(
        {
          mode: 'APPLY',
          scheduleWindow: {
            start,
            end,
            days: HORIZON_DAYS,
          },
          activeImportedTrains: trains.size,
          eligibleTrains: eligible.length,
          skippedForMissingOrInvalidEndpointTimes: skipped.length,
          schedulesConsidered: scheduleRows.length,
          schedulesFoundInWindow: schedules.length,
          sleeperCoachesConfigured: coachRows.length,
          illustrativeFaresConfigured: fareRows.length,
          seatsConfigured: seatRows.length,
          classType: CLASS_TYPE,
          seatsPerCoach: SEATS_PER_COACH,
          note: 'Fares are illustrative simulated project values, not official railway fares.',
        },
        null,
        2
      )
    );

    if (skipped.length) {
      console.log(
        'Skipped train numbers (route endpoint times missing/invalid):',
        skipped.join(', ')
      );
    }
  } finally {
    connection.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    'Schedule generation failed:',
    error.message
  );
  process.exitCode = 1;
});
