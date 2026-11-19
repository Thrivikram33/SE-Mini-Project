const CLASSES = Object.freeze([
  { classType: '1A', coachNumber: 'H1', fareMultiplier: 3.0, berthTypes: ['LOWER', 'UPPER'] },
  { classType: '2A', coachNumber: 'A1', fareMultiplier: 2.2, berthTypes: ['LOWER', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'] },
  { classType: '3A', coachNumber: 'B1', fareMultiplier: 1.6, berthTypes: ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'] },
  { classType: 'SL', coachNumber: 'S1', fareMultiplier: 1.0, berthTypes: ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER'] },
  { classType: 'CC', coachNumber: 'C1', fareMultiplier: 1.2, berthTypes: ['SEAT'] },
  { classType: '2S', coachNumber: 'D1', fareMultiplier: 0.7, berthTypes: ['SEAT'] },
])

const MAX_DAYS = 90
const SEATS_PER_COACH = 10
const CURRENCY = 'INR'

function dateString(date) {
  return date.toISOString().slice(0, 10)
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && dateString(parsed) === value
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return dateString(date)
}

function weekdayForDate(value) {
  return new Date(`${value}T00:00:00.000Z`).getUTCDay()
}

function parseClock(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function parseSeedOptions(args, today = new Date()) {
  const parsed = {
    source: '',
    destination: '',
    days: 30,
    startDate: dateString(today),
    apply: false,
    confirmSimulated: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--apply') {
      parsed.apply = true
    } else if (argument === '--confirm-simulated') {
      parsed.confirmSimulated = true
    } else if (['--source', '--destination', '--days', '--start-date'].includes(argument)) {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`)
      index += 1
      if (argument === '--source') parsed.source = value.trim().toUpperCase()
      if (argument === '--destination') parsed.destination = value.trim().toUpperCase()
      if (argument === '--days') parsed.days = Number(value)
      if (argument === '--start-date') parsed.startDate = value
    } else {
      throw new Error(`Unknown seed option: ${argument}`)
    }
  }

  if (!/^[A-Z0-9]{2,10}$/.test(parsed.source)) throw new Error('--source must be a station code (2–10 letters or digits).')
  if (!/^[A-Z0-9]{2,10}$/.test(parsed.destination)) throw new Error('--destination must be a station code (2–10 letters or digits).')
  if (parsed.source === parsed.destination) throw new Error('--source and --destination must differ.')
  if (!Number.isInteger(parsed.days) || parsed.days < 1 || parsed.days > MAX_DAYS) {
    throw new Error(`--days must be an integer from 1 to ${MAX_DAYS}.`)
  }
  if (!isValidDate(parsed.startDate)) throw new Error('--start-date must be a valid YYYY-MM-DD date.')
  if (parsed.startDate < dateString(today)) throw new Error('--start-date cannot be in the past.')
  if (parsed.confirmSimulated && !parsed.apply) throw new Error('--confirm-simulated is only valid together with --apply.')
  if (parsed.apply && !parsed.confirmSimulated) {
    throw new Error('Applying demo inventory requires both --apply and --confirm-simulated.')
  }

  return parsed
}

function normalizeRouteCandidates(rows) {
  const byTrain = new Map()
  for (const row of rows) {
    const trainId = String(row.trainId)
    if (!byTrain.has(trainId)) {
      const sourceDayOffset = Number(row.sourceDayOffset)
      const destinationDayOffset = Number(row.destinationDayOffset)
      const departureMinutes = parseClock(row.departureTime)
      const arrivalMinutes = parseClock(row.arrivalTime)
      const durationMinutes = (destinationDayOffset - sourceDayOffset) * 1440 +
        (arrivalMinutes ?? 0) - (departureMinutes ?? 0)
      const invalid = !Number.isInteger(sourceDayOffset) || sourceDayOffset < 0 ||
        !Number.isInteger(destinationDayOffset) || destinationDayOffset < 0 ||
        departureMinutes === null || arrivalMinutes === null || durationMinutes <= 0
      byTrain.set(trainId, {
        trainId,
        trainNumber: String(row.trainNumber),
        sourceDayOffset,
        destinationDayOffset,
        durationMinutes,
        invalid,
        runningDays: new Set(),
      })
    }
    const train = byTrain.get(trainId)
    const weekday = Number(row.weekday)
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) train.invalid = true
    else train.runningDays.add(weekday)
  }

  const routes = [...byTrain.values()].filter(train => !train.invalid && train.runningDays.size > 0)
  return { routes, invalidTrainCount: byTrain.size - routes.length }
}

function buildSchedulePlan(routes, startDate, days) {
  if (!isValidDate(startDate)) throw new Error('A valid seed start date is required.')
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new Error(`Seed days must be from 1 to ${MAX_DAYS}.`)

  const scheduleByKey = new Map()
  for (let offset = 0; offset < days; offset += 1) {
    const boardingDate = shiftDate(startDate, offset)
    for (const route of routes) {
      const journeyDate = shiftDate(boardingDate, -route.sourceDayOffset)
      if (!route.runningDays.has(weekdayForDate(journeyDate))) continue
      const key = `${route.trainId}:${journeyDate}`
      if (!scheduleByKey.has(key)) {
        scheduleByKey.set(key, {
          trainId: route.trainId,
          trainNumber: route.trainNumber,
          journeyDate,
          boardingDate,
          durationMinutes: route.durationMinutes,
        })
      }
    }
  }

  return [...scheduleByKey.values()].sort((left, right) =>
    left.journeyDate.localeCompare(right.journeyDate) || left.trainNumber.localeCompare(right.trainNumber),
  )
}

function simulatedFare(durationMinutes, multiplier) {
  const base = Math.max(50, Math.round(100 + durationMinutes * 0.5))
  return Math.max(50, Math.round(base * multiplier))
}

module.exports = {
  CLASSES,
  CURRENCY,
  MAX_DAYS,
  SEATS_PER_COACH,
  buildSchedulePlan,
  dateString,
  isValidDate,
  normalizeRouteCandidates,
  parseClock,
  parseSeedOptions,
  shiftDate,
  simulatedFare,
  weekdayForDate,
}
