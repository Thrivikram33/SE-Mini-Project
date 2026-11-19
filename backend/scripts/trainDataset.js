const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function minutesAtDay(time, day) {
  if (time == null) return null
  if (typeof time !== 'string' || !TIME_PATTERN.test(time)) return Number.NaN

  const [hours, minutes, seconds] = time.split(':').map(Number)
  if (seconds > 59) return Number.NaN
  return day * 1440 + hours * 60 + minutes
}

function optionalTime(value) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  return value.trim() || null
}

function normalizeTrainRecord(record, stationIds) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { reason: 'INVALID_RECORD' }
  }

  const trainNumber = text(record.trainNumber).toUpperCase()
  const trainName = text(record.trainName)
  const sourceCode = text(record.source?.code).toUpperCase()
  const destinationCode = text(record.destination?.code).toUpperCase()
  const route = record.completeOrderedRoute

  if (!trainNumber || trainNumber.length > 10 || !trainName || trainName.length > 150) {
    return { reason: 'INVALID_TRAIN_DETAILS' }
  }
  if (!sourceCode || !destinationCode || sourceCode.length > 10 || destinationCode.length > 10) {
    return { reason: 'INVALID_ENDPOINT_CODE' }
  }
  if (!Array.isArray(route) || route.length < 2) return { reason: 'INVALID_ROUTE_LENGTH' }

  const sourceIndex = route.findIndex(stop => text(stop?.stationCode).toUpperCase() === sourceCode)
  if (sourceIndex < 0) return { reason: 'SOURCE_NOT_IN_ROUTE' }

  let destinationIndex = -1
  for (let index = sourceIndex + 1; index < route.length; index += 1) {
    if (text(route[index]?.stationCode).toUpperCase() === destinationCode) {
      destinationIndex = index
      break
    }
  }
  if (destinationIndex < 0) return { reason: 'DESTINATION_NOT_AFTER_SOURCE' }

  const selectedRoute = route.slice(sourceIndex, destinationIndex + 1)
  const codes = selectedRoute.map(stop => text(stop?.stationCode).toUpperCase())
  if (codes.some(code => !code || code.length > 10 || /^(XX|YY)-/i.test(code))) {
    return { reason: 'INVALID_STATION_CODE' }
  }
  if (new Set(codes).size !== codes.length) return { reason: 'DUPLICATE_ROUTE_STATION' }
  if (codes.some(code => !stationIds.has(code))) return { reason: 'MISSING_STATION' }

  const runningDays = DAYS
    .map((day, weekday) => record.runningDays?.[day] === true ? weekday : null)
    .filter(weekday => weekday !== null)
  if (!runningDays.length) return { reason: 'MISSING_RUNNING_DAYS' }

  const firstJourneyDay = Number(selectedRoute[0].journeyDay)
  let previousEvent = null
  let invalidChronology = false
  const normalizedStops = []

  for (let index = 0; index < selectedRoute.length; index += 1) {
    const stop = selectedRoute[index]
    const originalIndex = sourceIndex + index
    const journeyDay = Number(stop.journeyDay)
    if (
      Number(stop.sequence) !== originalIndex + 1 ||
      !Number.isInteger(journeyDay) ||
      journeyDay < 1 ||
      journeyDay > 256 ||
      journeyDay < Number(selectedRoute[index - 1]?.journeyDay || firstJourneyDay)
    ) {
      return { reason: 'INVALID_SEQUENCE_OR_DAY' }
    }

    const arrivalTime = optionalTime(stop.arrivalTime)
    const departureTime = optionalTime(stop.departureTime)
    const arrivalMinute = minutesAtDay(arrivalTime, journeyDay - 1)
    const departureMinute = minutesAtDay(departureTime, journeyDay - 1)
    if (Number.isNaN(arrivalMinute) || Number.isNaN(departureMinute)) {
      return { reason: 'INVALID_TIME' }
    }
    if (
      (arrivalMinute !== null && previousEvent !== null && arrivalMinute < previousEvent) ||
      (departureMinute !== null && arrivalMinute !== null && departureMinute < arrivalMinute) ||
      (departureMinute !== null && previousEvent !== null && departureMinute < previousEvent)
    ) invalidChronology = true

    if (departureMinute !== null) previousEvent = departureMinute
    else if (arrivalMinute !== null) previousEvent = arrivalMinute

    normalizedStops.push({
      stationCode: codes[index],
      stationId: stationIds.get(codes[index]),
      sequence: index + 1,
      arrivalTime,
      departureTime,
      dayOffset: journeyDay - firstJourneyDay,
    })
  }

  return {
    train: {
      trainNumber,
      trainName,
      runningDays,
      route: normalizedStops,
    },
    trimmedLeadingStops: sourceIndex,
    trimmedTrailingStops: route.length - destinationIndex - 1,
    missingSourceDeparture: !normalizedStops[0].departureTime,
    missingDestinationArrival: !normalizedStops.at(-1).arrivalTime,
    invalidChronology,
  }
}

module.exports = { DAYS, normalizeTrainRecord }
