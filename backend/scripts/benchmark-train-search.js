#!/usr/bin/env node
'use strict'

// Exploratory train-search HTTP benchmark. Uses existing seeded inventory; it
// never writes to the database. Configure BASE_URL, SOURCE, DESTINATION, DATE,
// REQUESTS and CONCURRENCY in the environment.
const { performance } = require('node:perf_hooks')

const baseUrl = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '')
const source = process.env.SOURCE
const destination = process.env.DESTINATION
const date = process.env.DATE
const requests = Number(process.env.REQUESTS || 100)
const concurrency = Number(process.env.CONCURRENCY || 10)

if (!source || !destination || !date) {
  console.error('Set SOURCE, DESTINATION and DATE to a route present in the database.')
  process.exit(2)
}
if (!Number.isInteger(requests) || requests < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
  console.error('REQUESTS and CONCURRENCY must be positive integers.')
  process.exit(2)
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
}

async function main() {
  const url = new URL('/api/trains/search', baseUrl)
  url.search = new URLSearchParams({ source, destination, date }).toString()
  const samples = []
  const failures = []
  let next = 0

  async function worker() {
    while (next < requests) {
      const index = next++
      const started = performance.now()
      try {
        const response = await fetch(url)
        await response.arrayBuffer()
        const elapsed = performance.now() - started
        samples[index] = elapsed
        if (!response.ok) failures.push({ request: index + 1, status: response.status })
      } catch (error) {
        failures.push({ request: index + 1, error: error.message })
      }
    }
  }

  const started = performance.now()
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker))
  const duration = performance.now() - started
  const successful = samples.filter(Number.isFinite)
  const p95 = successful.length ? percentile(successful, 0.95) : null

  console.log(JSON.stringify({
    endpoint: url.pathname,
    requests,
    concurrency,
    completed: successful.length,
    failed: failures.length,
    elapsedMs: Number(duration.toFixed(2)),
    throughputRequestsPerSecond: Number((successful.length / (duration / 1000)).toFixed(2)),
    latencyMs: successful.length ? {
      min: Number(Math.min(...successful).toFixed(2)),
      median: Number(percentile(successful, 0.50).toFixed(2)),
      p95: Number(p95.toFixed(2)),
      max: Number(Math.max(...successful).toFixed(2)),
    } : null,
    p95TargetMs: 2000,
    p95TargetMetInThisRun: successful.length === requests && failures.length === 0 && p95 <= 2000,
    failureSamples: failures.slice(0, 10),
    note: 'Exploratory result only; acceptance requires an agreed normal-load profile and representative inventory.',
  }, null, 2))
  if (failures.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('Benchmark failed:', error.message)
  process.exitCode = 1
})
