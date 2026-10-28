const { test } = require('node:test')
const assert = require('node:assert/strict')
const { validatePassengerDetails } = require('../src/validators/passengerDetailsValidator')

test('accepts valid passenger details', () => {
  assert.deepEqual(
    validatePassengerDetails({ name: 'Asha Rao', age: 25, gender: 'FEMALE' }),
    { valid: true, errors: {} },
  )
})

test('rejects missing passenger details', () => {
  const result = validatePassengerDetails({})
  assert.equal(result.valid, false)
  assert.equal(result.errors.name, 'Passenger name is required.')
  assert.equal(result.errors.age, 'Passenger age is required.')
  assert.equal(result.errors.gender, 'Select a valid passenger gender.')
})

test('rejects blank and overlong names', () => {
  assert.ok(validatePassengerDetails({ name: '  ', age: 25, gender: 'MALE' }).errors.name)
  assert.ok(validatePassengerDetails({ name: 'A'.repeat(121), age: 25, gender: 'MALE' }).errors.name)
})

test('rejects invalid ages', () => {
  for (const age of [0, -1, 121, 2.5, 'abc', '']) {
    assert.ok(validatePassengerDetails({ name: 'Asha Rao', age, gender: 'FEMALE' }).errors.age, `Expected age ${JSON.stringify(age)} to be rejected`)
  }
})

test('accepts age boundaries and numeric strings', () => {
  for (const age of [1, 120, '25']) {
    assert.equal(validatePassengerDetails({ name: 'Asha Rao', age, gender: 'FEMALE' }).errors.age, undefined)
  }
})

test('rejects unsupported genders', () => {
  assert.ok(validatePassengerDetails({ name: 'Asha Rao', age: 25, gender: 'INVALID' }).errors.gender)
})

test('rejects null, arrays, and non-object input', () => {
  for (const passenger of [null, [], 'passenger']) {
    assert.equal(validatePassengerDetails(passenger).valid, false)
  }
})

test('accepts international names with supported punctuation', () => {
  for (const name of ['José García', '\u674e\u5c0f\u9f8d', "O'Connor", 'Anne-Marie']) {
    assert.equal(
      validatePassengerDetails({ name, age: 25, gender: 'UNDISCLOSED' }).valid,
      true,
      `Expected name ${JSON.stringify(name)} to be accepted`,
    )
  }
})

test('rejects names containing digits or unsupported symbols', () => {
  for (const name of ['Asha123', 'Asha@Rao', '<script>', 'Rao_']) {
    assert.ok(
      validatePassengerDetails({ name, age: 25, gender: 'FEMALE' }).errors.name,
      `Expected name ${JSON.stringify(name)} to be rejected`,
    )
  }
})

test('accepts each supported gender value', () => {
  for (const gender of ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']) {
    assert.equal(
      validatePassengerDetails({ name: 'Asha Rao', age: 25, gender }).valid,
      true,
      `Expected gender ${gender} to be accepted`,
    )
  }
})
