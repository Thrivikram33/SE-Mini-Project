'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { summarizeAvailability, isWithinMaintenance } = require('../src/services/availabilityService')

test('availability is null and target is unmet when no probes exist', () => {
  const result = summarizeAvailability([])
  assert.equal(result.availabilityPercentage, null)
  assert.equal(result.targetMet, false)
  assert.equal(result.totalProbes, 0)
})

test('availability reaches target at exactly 99 percent', () => {
  const observations = [
    ...Array.from({ length: 99 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      success: true,
    })),
    {
      timestamp: new Date(Date.UTC(2026, 0, 1, 1, 39)).toISOString(),
      success: false,
    },
  ]
  const result = summarizeAvailability(observations)
  assert.equal(result.availabilityPercentage, 99)
  assert.equal(result.targetMet, true)
  assert.equal(result.failedProbes, 1)
})

test('availability target fails below 99 percent', () => {
  const observations = [
    ...Array.from({ length: 98 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      success: true,
    })),
    {
      timestamp: new Date(Date.UTC(2026, 0, 1, 1, 38)).toISOString(),
      success: false,
    },
  ]
  const result = summarizeAvailability(observations)
  assert.equal(result.availabilityPercentage, 98.99)
  assert.equal(result.targetMet, false)
})

test('planned maintenance probes are excluded from the denominator', () => {
  const observations = [
    { timestamp: '2026-01-01T00:00:00.000Z', success: true },
    { timestamp: '2026-01-01T00:05:00.000Z', success: false },
    { timestamp: '2026-01-01T00:10:00.000Z', success: true },
  ]
  const result = summarizeAvailability(observations, {
    plannedMaintenance: [{
      start: '2026-01-01T00:04:00.000Z',
      end: '2026-01-01T00:06:00.000Z',
    }],
  })
  assert.equal(result.totalProbes, 2)
  assert.equal(result.failedProbes, 0)
  assert.equal(result.availabilityPercentage, 100)
})

test('invalid observations and invalid maintenance windows do not count', () => {
  const result = summarizeAvailability([
    { timestamp: 'not-a-date', success: true },
    { timestamp: '2026-01-01T00:00:00.000Z', success: 'yes' },
    { timestamp: '2026-01-01T00:01:00.000Z', success: false },
  ], {
    plannedMaintenance: [{
      start: 'invalid',
      end: '2026-01-01T00:02:00.000Z',
    }],
  })
  assert.equal(result.totalProbes, 1)
  assert.equal(result.availabilityPercentage, 0)
  assert.equal(result.targetMet, false)
})

test('maintenance interval includes start and excludes end', () => {
  const window = [{
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-01-01T00:10:00.000Z',
  }]
  assert.equal(isWithinMaintenance('2026-01-01T00:00:00.000Z', window), true)
  assert.equal(isWithinMaintenance('2026-01-01T00:10:00.000Z', window), false)
})
