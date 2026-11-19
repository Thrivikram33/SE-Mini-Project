const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDemoData, isValidDate, demoData } = require('../setup-train-demo');

test('demo dataset contains unique station codes and train numbers', () => {
  const stationCodes = demoData.stations.map(station => station.code);
  const trainNumbers = demoData.trains.map(train => train.number);
  assert.equal(new Set(stationCodes).size, stationCodes.length);
  assert.equal(new Set(trainNumbers).size, trainNumbers.length);
  assert.doesNotThrow(() => validateDemoData(demoData));
});

test('every demo train references known distinct stations and valid classes', () => {
  const stationCodes = new Set(demoData.stations.map(station => station.code));
  for (const train of demoData.trains) {
    assert.ok(stationCodes.has(train.source));
    assert.ok(stationCodes.has(train.destination));
    assert.notEqual(train.source, train.destination);
    assert.ok(train.classes.length > 0);
  }
});

test('demo journey date validation rejects malformed and impossible dates', () => {
  assert.equal(isValidDate('2026-11-20'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('20-11-2026'), false);
  assert.equal(isValidDate(''), false);
});

test('demo seed contains no passenger or credential records', () => {
  assert.equal(Object.hasOwn(demoData, 'users'), false);
  assert.equal(Object.hasOwn(demoData, 'accounts'), false);
});