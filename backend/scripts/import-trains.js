
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
const pool = require('../src/config/db')

const DATASET = path.resolve(__dirname, '../../trains.txt')
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function validate(train, stationMap) {
  const number = String(train.trainNumber || '').trim().toUpperCase()
  const name = String(train.trainName || '').trim()
  const route = train.completeOrderedRoute

  if (!number || number.length > 10 || !name || name.length > 150)
    return 'INVALID_TRAIN_DETAILS'

  if (!Array.isArray(route) || route.length < 2)
    return 'INVALID_ROUTE_LENGTH'

  const codes = route.map(s => String(s.stationCode || '').trim().toUpperCase())

  if (codes.some(c => !c || c.length > 10 || /^(XX|YY)-/i.test(c)))
    return 'INVALID_STATION_CODE'

  if (new Set(codes).size !== codes.length)
    return 'DUPLICATE_ROUTE_STATION'

  if (
    codes[0] !== String(train.source?.code || '').trim().toUpperCase() ||
    codes.at(-1) !== String(train.destination?.code || '').trim().toUpperCase()
  )
    return 'ENDPOINT_MISMATCH'

  if (codes.some(c => !stationMap.has(c)))
    return 'MISSING_STATION'

  for (let i = 0; i < route.length; i++) {
    const s = route[i]

    if (
      Number(s.sequence) !== i + 1 ||
      !Number.isInteger(Number(s.journeyDay)) ||
      Number(s.journeyDay) < 1 ||
      Number(s.journeyDay) > 256
    )
      return 'INVALID_SEQUENCE_OR_DAY'

    for (const field of ['arrivalTime', 'departureTime']) {
      if (
        s[field] != null &&
        !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s[field])
      )
        return 'INVALID_TIME'
    }
  }

  return null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'))
  const connection = await pool.getConnection()

  try {
    const [stations] = await connection.query(
      'SELECT station_id, code FROM stations'
    )

    const stationMap = new Map(
      stations.map(s => [s.code.toUpperCase(), s.station_id])
    )

    const [existingRows] = await connection.query(
      'SELECT train_number FROM trains'
    )

    const existing = new Set(
      existingRows.map(t => t.train_number.toUpperCase())
    )

    const seen = new Set()
    const prepared = []
    const reasons = {}

    for (const train of dataset) {
      const number = String(train.trainNumber || '').trim().toUpperCase()

      if (existing.has(number)) {
        reasons.EXISTING_TRAIN = (reasons.EXISTING_TRAIN || 0) + 1
        continue
      }

      if (seen.has(number)) {
        reasons.DUPLICATE_DATASET_NUMBER =
          (reasons.DUPLICATE_DATASET_NUMBER || 0) + 1
        continue
      }

      seen.add(number)

      const reason = validate(train, stationMap)

      if (reason) {
        reasons[reason] = (reasons[reason] || 0) + 1
        continue
      }

      prepared.push({
        number,
        name: String(train.trainName).trim(),
        route: train.completeOrderedRoute,
        days: DAYS.map((day, i) =>
          train.runningDays?.[day] === true ? i : null
        ).filter(day => day !== null)
      })
    }

    const report = {
      mode: apply ? 'APPLY' : 'DRY RUN',
      datasetRecords: dataset.length,
      validTrains: prepared.length,
      validRoutes: prepared.length,
      routeStopsToInsert: prepared.reduce(
        (n, t) => n + t.route.length,
        0
      ),
      runningDayRowsToInsert: prepared.reduce(
        (n, t) => n + t.days.length,
        0
      ),
      skipped: dataset.length - prepared.length,
      skippedReasons: reasons,
      insertedTrains: 0,
      insertedRouteStops: 0,
      insertedRunningDays: 0
    }

    if (!apply) {
      console.log(JSON.stringify(report, null, 2))
      console.log('DRY RUN ONLY: no database records changed.')
      return
    }

    // The train_running_days table must already exist.
    // It is created by database migration 006.

    await connection.beginTransaction()

    try {
      for (const train of prepared) {
        const [result] = await connection.execute(
          'INSERT INTO trains (train_number, train_name, active) VALUES (?, ?, 1)',
          [train.number, train.name]
        )

        const trainId = result.insertId
        report.insertedTrains++

        for (const day of train.days) {
          await connection.execute(
            'INSERT INTO train_running_days (train_id, weekday) VALUES (?, ?)',
            [trainId, day]
          )

          report.insertedRunningDays++
        }

        for (const stop of train.route) {
          await connection.execute(
            `INSERT INTO route_stops
             (train_id, station_id, sequence_no, arrival_time, departure_time, day_offset)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              trainId,
              stationMap.get(
                String(stop.stationCode).trim().toUpperCase()
              ),
              Number(stop.sequence),
              stop.arrivalTime || null,
              stop.departureTime || null,
              Number(stop.journeyDay) - 1
            ]
          )

          report.insertedRouteStops++
        }
      }

      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    }

    console.log(JSON.stringify(report, null, 2))
  } finally {
    connection.release()
    await pool.end()
  }
}

main().catch(error => {
  console.error('Train import failed:', error.message)
  process.exitCode = 1
})
