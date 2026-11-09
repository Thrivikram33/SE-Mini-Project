const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('Issue 19 migration adds station and route-stop search indexes without destructive DDL', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../database/migrations/005_train_search_performance_indexes.sql'),
    'utf8',
  )
  assert.match(migration, /ADD KEY idx_stations_name \(name\)/)
  assert.match(
    migration,
    /ADD KEY idx_route_station_train_sequence_departure\s*\(station_id, train_id, sequence_no, departure_time, day_offset\)/,
  )
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM|DROP COLUMN/i)
})

test('Issue 19 benchmark targets the train-search endpoint and reports P95', () => {
  const benchmark = fs.readFileSync(
    path.resolve(__dirname, '../scripts/benchmark-train-search.js'),
    'utf8',
  )
  assert.match(benchmark, /\/api\/trains\/search/)
  assert.match(benchmark, /p95TargetMs: 2000/)
  assert.match(benchmark, /CONCURRENCY/)
  assert.match(benchmark, /Exploratory result only/)
})
