#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { summarizeAvailability } = require('../src/services/availabilityService')

const baseUrl = (process.env.AVAILABILITY_HEALTH_URL || 'http://127.0.0.1:5000/api/health').replace(/\/$/, '')
const intervalMs = Number(process.env.AVAILABILITY_INTERVAL_MS || 10000)
const durationMs = Number(process.env.AVAILABILITY_DURATION_MS || 60 * 60 * 1000)
const timeoutMs = Number(process.env.AVAILABILITY_TIMEOUT_MS || 5000)
const logFile = path.resolve(process.env.AVAILABILITY_LOG_FILE || path.join(__dirname, '../logs/availability.jsonl'))
const maintenance = parseMaintenance(process.env.AVAILABILITY_MAINTENANCE_WINDOWS || '[]')

function parseMaintenance(value) {
  let windows
  try {
    windows = JSON.parse(value)
  } catch {
    throw new Error('AVAILABILITY_MAINTENANCE_WINDOWS must be a JSON array.')
  }
  if (!Array.isArray(windows) || windows.some((window) =>
    !window || typeof window.start !== 'string' || typeof window.end !== 'string' ||
    !Number.isFinite(Date.parse(window.start)) || !Number.isFinite(Date.parse(window.end)) ||
    Date.parse(window.end) <= Date.parse(window.start),
  )) {
    throw new Error('Each maintenance window must contain valid ISO start and end timestamps.')
  }
  return windows
}

function readObservations() {
  if (!fs.existsSync(logFile)) return []
  return fs.readFileSync(logFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line) } catch { return null }
  }).filter(Boolean)
}

async function probe() {
  const timestamp = new Date().toISOString()
  const started = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let observation

  try {
    const response = await fetch(baseUrl, { signal: controller.signal })
    observation = {
      timestamp,
      success: response.ok,
      statusCode: response.status,
      durationMs: Date.now() - started,
    }
  } catch (error) {
    observation = {
      timestamp,
      success: false,
      statusCode: null,
      durationMs: Date.now() - started,
      error: error.name === 'AbortError' ? 'TIMEOUT' : 'UNREACHABLE',
    }
  } finally {
    clearTimeout(timeout)
  }

  fs.mkdirSync(path.dirname(logFile), { recursive: true })
  fs.appendFileSync(logFile, `${JSON.stringify(observation)}\n`, { encoding: 'utf8' })
  process.stdout.write(`${observation.timestamp} ${observation.success ? 'UP' : 'DOWN'} ${observation.durationMs}ms\n`)
}

function report() {
  const summary = summarizeAvailability(readObservations(), { plannedMaintenance: maintenance })
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (!summary.targetMet) process.exitCode = 1
}

async function monitor() {
  if (!Number.isInteger(intervalMs) || intervalMs < 1000 ||
      !Number.isInteger(durationMs) || durationMs < intervalMs ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100) {
    throw new Error('Use interval >= 1000ms, duration >= interval, and timeout >= 100ms.')
  }

  const endAt = Date.now() + durationMs
  do {
    await probe()
    const remaining = endAt - Date.now()
    if (remaining > 0) await delay(Math.min(intervalMs, remaining))
  } while (Date.now() < endAt)
  report()
}

if (process.argv.includes('--report')) {
  report()
} else {
  monitor().catch((error) => {
    process.stderr.write(`Availability monitor failed: ${error.message}\n`)
    process.exitCode = 1
  })
}
