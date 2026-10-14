import { ApiError } from '../shared/apiError.js'

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function toMinutes(time) {
  const [hours, minutes] = String(time).split(':').map(Number)
  return hours * 60 + minutes
}

export function createTrainService(repository, today = () => new Date().toISOString().slice(0, 10)) {
  return {
    async listStations() {
      return repository.listStations()
    },
    async getAvailability(value) {
      const scheduleId = Number(value)
      if (!Number.isSafeInteger(scheduleId) || scheduleId < 1) throw new ApiError(400, 'INVALID_SCHEDULE', 'Schedule ID must be a positive integer.')
      const result = await repository.getAvailability(scheduleId)
      if (!result) throw new ApiError(404, 'SCHEDULE_NOT_FOUND', 'Schedule was not found.')
      if (result.schedule.status !== 'SCHEDULED') throw new ApiError(409, 'SCHEDULE_UNAVAILABLE', 'This schedule is not available.')
      const classes = new Map()
      for (const row of result.rows) {
        if (!classes.has(row.classType)) classes.set(row.classType, { classType: row.classType, fare: Number(row.fare), seats: [] })
        if (row.seatId !== null) classes.get(row.classType).seats.push({
          seatId: Number(row.seatId), seatNumber: row.seatNumber, status: row.seatStatus,
        })
      }
      const schedule = result.schedule
      return {
        scheduleId: Number(schedule.scheduleId),
        journeyDate: schedule.journeyDate instanceof Date ? schedule.journeyDate.toISOString().slice(0, 10) : String(schedule.journeyDate).slice(0, 10),
        trainNumber: schedule.trainNumber,
        trainName: schedule.trainName,
        classes: [...classes.values()].map((item) => ({
          ...item,
          availableSeats: item.seats.filter((seat) => seat.status === 'AVAILABLE').length,
        })),
      }
    },
    async search(query) {
      const source = String(query.source || '').trim().toUpperCase()
      const destination = String(query.destination || '').trim().toUpperCase()
      const date = String(query.date || '')
      const classType = query.class ? String(query.class).trim().toUpperCase() : undefined

      if (!/^[A-Z0-9]{2,10}$/.test(source) || !/^[A-Z0-9]{2,10}$/.test(destination)) {
        throw new ApiError(400, 'INVALID_STATION', 'Use valid source and destination station codes.')
      }
      if (source === destination) throw new ApiError(400, 'SAME_STATION', 'Source and destination must differ.')
      if (!isCalendarDate(date) || date < today()) {
        throw new ApiError(400, 'INVALID_DATE', 'Journey date must be a valid date today or later.')
      }
      if (classType && !/^[A-Z0-9]{2,12}$/.test(classType)) {
        throw new ApiError(400, 'INVALID_CLASS', 'Travel class is invalid.')
      }

      const trains = await repository.search({ source, destination, date, classType })
      return trains.map((train) => {
        let durationMinutes = toMinutes(train.arrivalTime) - toMinutes(train.departureTime)
        if (durationMinutes < 0) durationMinutes += 24 * 60
        return { ...train, durationMinutes }
      })
    },
  }
}
