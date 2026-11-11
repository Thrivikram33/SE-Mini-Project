#!/usr/bin/env node
'use strict'

// Sends real authenticated booking requests. Provide disposable, reserved test
// seats: every successful sample permanently consumes one seat in that schedule.
const { performance } = require('node:perf_hooks')

const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const cookie = process.env.COOKIE
const scheduleId = process.env.SCHEDULE_ID
const source = process.env.SOURCE
const destination = process.env.DESTINATION
const classType = process.env.CLASS_TYPE || 'SL'
const seatIds = (process.env.SEAT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean)
const requests = Number(process.env.REQUESTS || 100)
const warmup = Number(process.env.WARMUP || 5)
const concurrency = Number(process.env.CONCURRENCY || 1)

if (!cookie || !scheduleId || !source || !destination || seatIds.length < requests + warmup) {
  console.error('Set COOKIE, SCHEDULE_ID, SOURCE, DESTINATION and at least REQUESTS+WARMUP reserved SEAT_IDS.')
  process.exit(2)
}
if (![requests, warmup, concurrency].every(Number.isSafeInteger) || requests < 20 || warmup < 0 || concurrency < 1) {
  console.error('REQUESTS must be at least 20; WARMUP must be nonnegative; CONCURRENCY must be positive integers.')
  process.exit(2)
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

async function send(index) {
  const startedAt = performance.now()
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie,
    },
    body: JSON.stringify({
      scheduleId,
      source,
      destination,
      classType,
      seatIds: [seatIds[index]],
      passengers: [{ name: `Benchmark Passenger ${index}`, age: 30, gender: 'OTHER' }],
    }),
  })
  await response.arrayBuffer()
  const totalObservedMs = performance.now() - startedAt
  const timing = response.headers.get('server-timing') || ''
  const processingMs = Number(timing.match(/booking-processing;dur=([\d.]+)/)?.[1])
  const simulatedPaymentMs = Number(timing.match(/simulated-payment;dur=([\d.]+)/)?.[1])
  return { status: response.status, totalObservedMs, processingMs, simulatedPaymentMs }
}

async function main() {
  const warmupResults = []
  for (let index = 0; index < warmup; index += 1) {
    warmupResults.push(await send(index))
  }
  if (warmupResults.some((item) => item.status !== 201)) {
    throw new Error('Warm-up booking failed; check the session and reserved test inventory.')
  }

  let next = warmup
  const results = []
  const runStartedAt = performance.now()
  async function worker() {
    while (next < warmup + requests) {
      const index = next++
      try {
        results[index - warmup] = await send(index)
      } catch (error) {
        results[index - warmup] = { error: error.message }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker))
  const elapsedMs = performance.now() - runStartedAt
  const successful = results.filter((item) => item.status === 201)
  const failed = results.filter((item) => item.status !== 201)
  const validMetrics = successful.filter((item) =>
    Number.isFinite(item.processingMs) && Number.isFinite(item.simulatedPaymentMs),
  )
  const summary = (values) => values.length ? {
    median: Number(percentile(values, 0.5).toFixed(2)),
    p90: Number(percentile(values, 0.9).toFixed(2)),
    p95: Number(percentile(values, 0.95).toFixed(2)),
    p99: Number(percentile(values, 0.99).toFixed(2)),
    max: Number(Math.max(...values).toFixed(2)),
  } : null
  // Measure request-to-response at the client and subtract only the simulator's
  // explicitly timed interval. Database persistence and response handling stay included.
  const processing = validMetrics.map((item) =>
    Math.max(0, item.totalObservedMs - item.simulatedPaymentMs),
  )
  const total = successful.map((item) => item.totalObservedMs)
  const p95 = processing.length ? percentile(processing, 0.95) : null

  console.log(JSON.stringify({
    endpoint: 'POST /api/bookings',
    databaseEnvironment: process.env.DATABASE_ENVIRONMENT || 'not specified',
    runtime: process.version,
    requested: requests,
    successful: successful.length,
    failed: failed.length,
    concurrency,
    warmupRequestsExcluded: warmup,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    throughputSuccessfulBookingsPerSecond: Number((successful.length / (elapsedMs / 1000)).toFixed(2)),
    totalObservedResponseMs: summary(total),
    responseTimeExcludingOnlyMeasuredSimulatorWorkMs: summary(processing),
    backendServiceProcessingMs: summary(validMetrics.map((item) => item.processingMs)),
    simulatedPaymentLatencyMs: summary(validMetrics.map((item) => item.simulatedPaymentMs)),
    p95TargetMs: 3000,
    p95TargetMetInThisRun: successful.length === requests && validMetrics.length === requests && p95 <= 3000,
    failureSamples: failed.slice(0, 10),
    note: 'Each warm-up and successful request permanently consumes one supplied seat. P95 uses nearest-rank on successful measured bookings only.',
  }, null, 2))
  if (failed.length || validMetrics.length !== requests) process.exitCode = 1
}

main().catch((error) => {
  console.error('Booking benchmark failed:', error.message)
  process.exitCode = 1
})
