export function groupTrainsBySchedule(trains) {
  const grouped = new Map()

  for (const train of trains) {
    const scheduleKey = train.scheduleId == null
      ? `route:${train.trainId}:${train.source.code}:${train.destination.code}:${train.journeyDate}`
      : `schedule:${train.scheduleId}`

    if (!grouped.has(scheduleKey)) {
      grouped.set(scheduleKey, { ...train, resultKey: scheduleKey, classes: [] })
    }

    if (train.classType) {
      const group = grouped.get(scheduleKey)
      if (!group.classes.some(item => item.classType === train.classType)) {
        group.classes.push({
          classType: train.classType,
          fare: train.fare,
          availableSeats: train.availableSeats,
          bookable: Boolean(train.bookable),
        })
      }
    }
  }

  return Array.from(grouped.values())
}
