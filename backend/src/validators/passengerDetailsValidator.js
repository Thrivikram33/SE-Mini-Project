const VALID_GENDERS = new Set(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])

function validatePassengerDetails(passenger) {
  const errors = {}

  if (!passenger || typeof passenger !== 'object' || Array.isArray(passenger)) {
    return { valid: false, errors: { passenger: 'Passenger details are required.' } }
  }

  if (typeof passenger.name !== 'string' || !passenger.name.trim()) {
    errors.name = 'Passenger name is required.'
  } else if (passenger.name.trim().length > 120) {
    errors.name = 'Passenger name must be 120 characters or fewer.'
  } else if (!/^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u.test(passenger.name.trim())) {
    errors.name = 'Enter a valid passenger name.'
  }

  if (passenger.age === undefined || passenger.age === null || passenger.age === '') {
    errors.age = 'Passenger age is required.'
  } else if (
    !Number.isInteger(Number(passenger.age)) ||
    !/^\d+$/.test(String(passenger.age)) ||
    Number(passenger.age) < 1 ||
    Number(passenger.age) > 120
  ) {
    errors.age = 'Passenger age must be a whole number between 1 and 120.'
  }

  if (typeof passenger.gender !== 'string' || !VALID_GENDERS.has(passenger.gender)) {
    errors.gender = 'Select a valid passenger gender.'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

module.exports = { validatePassengerDetails }
