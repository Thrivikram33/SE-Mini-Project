const PERSON_NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u

function isValidPersonName(value, maxLength, minLength = 1) {
  if (typeof value !== 'string') return false
  const name = value.trim()
  return name.length >= minLength && name.length <= maxLength && PERSON_NAME_PATTERN.test(name)
}

module.exports = { isValidPersonName }
