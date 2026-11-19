/**
 * Generate demo schedules and simulated inventory for all six supported classes.
 *
 * Uses imported route timings and running days. Does not invent train timings.
 * Fares are illustrative project-demo values, NOT official railway fares.
 *
 * Creates a rolling 30-day schedule window.
 * Safe to rerun: INSERT IGNORE preserves existing schedules, coaches, fares
 * and seats. Existing bookings and seat allocations are not modified.
 *
 * Run from backend:
 *   node scripts/generate-imported-schedules.js
 */
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const pool = require('../src/config/db');

const HORIZON_DAYS = 30;
const SEATS_PER_COACH = 10;
const CURRENCY = 'INR';
const INSERT_CHUNK_SIZE = 500;

// These are simulated demo configurations, not actual train compositions.
const CLASS_CONFIG = [
  {
    classType: '1A',
    coachNumber: 'H1',
    fareMultiplier: 3.0,
    berthTypes: ['LOWER', 'UPPER'],
  },
  {
    classType: '2A',
    coachNumber: 'A1',
    fareMultiplier: 2.2,
    berthTypes: ['LOWER', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'],
  },
  {
    classType: '3A',
    coachNumber: 'B1',
    fareMultiplier: 1.6,
    berthTypes: ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'],
  },
  {
    classType: 'SL',
    coachNumber: 'S1',
    fareMultiplier: 1.0,
    berthTypes: ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'],
  },
  {
    classType: 'CC',
    coachNumber: 'C1',
    fareMultiplier: 1.2,
    berthTypes: ['SEAT'],
  },
  {
    classType: '2S',
    coachNumber: 'D1',
    fareMultiplier: 0.7,
    berthTypes: ['SEAT'],
  },
];

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function minutes(time) {
  if (
    typeof time !== 'string' ||
    !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)
  ) {
    return null;
  }

  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function baseDemoFare(durationMinutes) {
  return Math.max(50, Math.round(100 + durationMinutes * 0.5));
}

function classDemoFare(baseFare, multiplier) {
  return Math.max(50, Math.round(baseFare * multiplier));
}

async function insertChunks(connection, sql, rows) {
  for (
    let index = 0;
    index < rows.length;
    index += INSERT_CHUNK_SIZE
  ) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);

    if (chunk.length) {
      await connection.query(sql, [chunk]);
    }
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
      JOIN train_running_days d
        ON d.train_id = t.train_id
      JOIN route_stops rs
        ON rs.train_id = t.train_id
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
        train.stops[train.stops.length - 1].sequenceNo !==
          Number(row.sequenceNo)
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
        (stop) => minutes(stop.departureTime) !== null,
      );

      const departure = minutes(
        departureStop && departureStop.departureTime,
      );

      const arrivalStop = [...train.stops].reverse().find((stop) => {
        const arrival = minutes(stop.arrivalTime);

        if (arrival === null || !departureStop) {
          return false;
        }

        const elapsed =
          (stop.dayOffset - departureStop.dayOffset) * 1440 +
          arrival -
          departure;

        return elapsed > 0;
      });

      const arrival = minutes(
        arrivalStop && arrivalStop.arrivalTime,
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
        baseFare: baseDemoFare(durationMinutes),
      });
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setUTCDate(
      endDate.getUTCDate() + HORIZON_DAYS - 1,
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
      `INSERT IGNORE INTO schedules
       (train_id, journey_date, status)
       VALUES ?`,
      scheduleRows,
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
        index + INSERT_CHUNK_SIZE,
      );

      if (!ids.length) continue;

      const placeholders = ids.map(() => '?').join(',');

      const [rows] = await connection.execute(
        `SELECT
           schedule_id AS scheduleId,
           train_id AS trainId
         FROM schedules
         WHERE train_id IN (${placeholders})
           AND journey_date BETWEEN ? AND ?
           AND status = 'SCHEDULED'`,
        [...ids, start, end],
      );

      schedules = schedules.concat(rows);
    }

    // Create one simulated coach for each supported class.
    const coachRows = [];

    for (const schedule of schedules) {
      for (const classConfig of CLASS_CONFIG) {
        coachRows.push([
          schedule.scheduleId,
          classConfig.classType,
          classConfig.coachNumber,
        ]);
      }
    }

    await insertChunks(
      connection,
      `INSERT IGNORE INTO coaches
       (schedule_id, class_type, coach_number)
       VALUES ?`,
      coachRows,
    );

    // Create a separate illustrative fare for each schedule and class.
    const fareByTrain = new Map(
      eligible.map((train) => [
        train.trainId,
        train.baseFare,
      ]),
    );

    const fareRows = [];

    for (const schedule of schedules) {
      const baseFare = fareByTrain.get(Number(schedule.trainId));

      for (const classConfig of CLASS_CONFIG) {
        fareRows.push([
          schedule.scheduleId,
          classConfig.classType,
          classDemoFare(baseFare, classConfig.fareMultiplier),
          CURRENCY,
        ]);
      }
    }

    await insertChunks(
      connection,
      `INSERT IGNORE INTO fares
       (schedule_id, class_type, amount, currency)
       VALUES ?`,
      fareRows,
    );

    // Retrieve the exact simulated coaches and add their seats.
    const scheduleIds = schedules.map(
      (schedule) => Number(schedule.scheduleId),
    );

    const seatRows = [];

    for (
      let index = 0;
      index < scheduleIds.length;
      index += INSERT_CHUNK_SIZE
    ) {
      const ids = scheduleIds.slice(
        index,
        index + INSERT_CHUNK_SIZE,
      );

      if (!ids.length) continue;

      const placeholders = ids.map(() => '?').join(',');

      const [coaches] = await connection.execute(
        `SELECT
           coach_id AS coachId,
           class_type AS classType,
           coach_number AS coachNumber
         FROM coaches
         WHERE schedule_id IN (${placeholders})`,
        ids,
      );

      for (const coach of coaches) {
        const classConfig = CLASS_CONFIG.find(
          (item) =>
            item.classType === coach.classType &&
            item.coachNumber === coach.coachNumber,
        );

        if (!classConfig) continue;

        for (
          let seat = 1;
          seat <= SEATS_PER_COACH;
          seat += 1
        ) {
          const berthType =
            classConfig.berthTypes[
              (seat - 1) % classConfig.berthTypes.length
            ];

          seatRows.push([
            coach.coachId,
            String(seat),
            berthType,
            'AVAILABLE',
          ]);
        }
      }
    }

    await insertChunks(
      connection,
      `INSERT IGNORE INTO seats
       (coach_id, seat_number, berth_type, status)
       VALUES ?`,
      seatRows,
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
          supportedClasses: CLASS_CONFIG.map(
            (item) => item.classType,
          ),
          simulatedCoachesConfigured: coachRows.length,
          illustrativeFaresConfigured: fareRows.length,
          simulatedSeatsConfigured: seatRows.length,
          seatsPerCoach: SEATS_PER_COACH,
          note:
            'All coach configurations, seat inventories and fares are simulated project-demo values, not official railway data.',
        },
        null,
        2,
      ),
    );

    if (skipped.length) {
      console.log(
        'Skipped train numbers (route endpoint times missing/invalid):',
        skipped.join(', '),
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
    error.message,
  );
  process.exitCode = 1;
});