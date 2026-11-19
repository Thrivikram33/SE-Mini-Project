const test = require('node:test')
const assert = require('node:assert/strict')
const {
  CLASSES,
  buildSchedulePlan,
  normalizeRouteCandidates,
  parseSeedOptions,
  simulatedFare,
} = require('../scripts/bookingInventorySeed')

test('seed options require a station pair and explicit confirmation for writes', () => {
  const today = new Date('2026-11-19T12:00:00.000Z')
  const dryRun = parseSeedOptions(['--source', 'sbc', '--destination', 'mys'], today)
  assert.equal(dryRun.source, 'SBC')
  assert.equal(dryRun.destination, 'MYS')
  assert.equal(dryRun.days, 30)
  assert.equal(dryRun.startDate, '2026-11-19')
  assert.equal(dryRun.apply, false)
  assert.throws(() => parseSeedOptions(['--source', 'SBC', '--destination', 'MYS', '--apply'], today), /requires both --apply and --confirm-simulated/)
  assert.throws(() => parseSeedOptions(['--source', 'SBC', '--destination', 'MYS', '--confirm-simulated'], today), /only valid together with --apply/)
  assert.throws(() => parseSeedOptions(['--source', 'SBC', '--destination', 'SBC'], today), /must differ/)
})

test('seed windows accept only valid dates and bounded positive day counts', () => {
  const prefix = ['--source', 'SBC', '--destination', 'MYS']
  assert.throws(() => parseSeedOptions([...prefix, '--days', '0']), /integer from 1 to 90/)
  assert.throws(() => parseSeedOptions([...prefix, '--days', '91']), /integer from 1 to 90/)
  assert.throws(() => parseSeedOptions([...prefix, '--start-date', '2026-02-30']), /valid YYYY-MM-DD/)
  assert.throws(() => parseSeedOptions([...prefix, '--start-date', '2026-11-18'], new Date('2026-11-19T12:00:00.000Z')), /cannot be in the past/)
  assert.throws(() => parseSeedOptions([...prefix, '--bad-option']), /Unknown seed option/)
})

test('route candidates retain only valid timed legs and collect actual operating weekdays', () => {
  const { routes, invalidTrainCount } = normalizeRouteCandidates([
    { trainId: 1, trainNumber: 'T001', sourceDayOffset: 0, departureTime: '23:50:00', destinationDayOffset: 1, arrivalTime: '01:15:00', weekday: 3 },
    { trainId: 1, trainNumber: 'T001', sourceDayOffset: 0, departureTime: '23:50:00', destinationDayOffset: 1, arrivalTime: '01:15:00', weekday: 5 },
    { trainId: 2, trainNumber: 'T002', sourceDayOffset: 0, departureTime: '10:00:00', destinationDayOffset: 0, arrivalTime: '09:00:00', weekday: 1 },
    { trainId: 3, trainNumber: 'T003', sourceDayOffset: 0, departureTime: null, destinationDayOffset: 0, arrivalTime: '12:00:00', weekday: 1 },
  ])
  assert.equal(invalidTrainCount, 2)
  assert.equal(routes.length, 1)
  assert.equal(routes[0].durationMinutes, 85)
  assert.deepEqual([...routes[0].runningDays], [3, 5])
})

test('schedule planning respects source stop day offsets and does not schedule every day', () => {
  const route = {
    trainId: '7',
    trainNumber: 'T007',
    sourceDayOffset: 1,
    durationMinutes: 210,
    runningDays: new Set([3]), // The train starts on Wednesday.
  }
  const plan = buildSchedulePlan([route], '2026-11-19', 4)
  assert.deepEqual(plan.map(item => ({ journeyDate: item.journeyDate, boardingDate: item.boardingDate })), [
    { journeyDate: '2026-11-18', boardingDate: '2026-11-19' },
  ])
})

test('seed fares are generated only as explicit simulated values for supported classes', () => {
  assert.deepEqual(CLASSES.map(item => item.classType), ['1A', '2A', '3A', 'SL', 'CC', '2S'])
  assert.equal(simulatedFare(180, 1), 190)
  assert.equal(simulatedFare(180, 0.7), 133)
})
