import test from 'node:test'
import assert from 'node:assert/strict'
import { groupTrainsBySchedule } from '../src/trainSearchUtils.js'

function train(overrides = {}) {
  return {
    trainId: 1,
    trainNumber: '12345',
    trainName: 'Test Express',
    scheduleId: null,
    source: { code: 'AAA', name: 'Alpha' },
    destination: { code: 'BBB', name: 'Beta' },
    journeyDate: '2026-12-01',
    classType: null,
    fare: null,
    availableSeats: 0,
    bookable: false,
    ...overrides,
  }
}

test('groups route-only results by train and requested route instead of collapsing null schedules', () => {
  const grouped = groupTrainsBySchedule([
    train(),
    train({
      trainId: 2,
      trainNumber: '54321',
      trainName: 'Other Express',
    }),
  ])

  assert.equal(grouped.length, 2)
  assert.deepEqual(grouped.map(result => result.trainId), [1, 2])
})

test('groups class rows for one schedule and carries bookability into the class option', () => {
  const grouped = groupTrainsBySchedule([
    train({ scheduleId: 9, classType: 'SL', bookable: true, availableSeats: 5 }),
    train({ scheduleId: 9, classType: '3A', bookable: false, availableSeats: 0 }),
  ])

  assert.equal(grouped.length, 1)
  assert.deepEqual(grouped[0].classes.map(item => [item.classType, item.bookable]), [
    ['SL', true],
    ['3A', false],
  ])
})
