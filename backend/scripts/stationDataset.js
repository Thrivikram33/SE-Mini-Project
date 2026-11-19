function cityFromStation(station) {
  const address = typeof station.address === 'string' ? station.address.trim() : ''
  if (!address) return ''

  const state = typeof station.state === 'string' ? station.state.trim() : ''
  const parts = address.split(',').map(part => part.trim()).filter(Boolean)
  const withoutState = parts.length > 1 && state &&
    parts.at(-1).toLowerCase() === state.toLowerCase()
    ? parts.slice(0, -1)
    : parts

  return withoutState[0] || ''
}

function normalizeStation(station) {
  if (!station || typeof station !== 'object' || Array.isArray(station)) {
    return { reason: 'INVALID_RECORD' }
  }

  const code = typeof station.code === 'string' ? station.code.trim().toUpperCase() : ''
  const name = typeof station.name === 'string' ? station.name.trim() : ''
  const city = cityFromStation(station)

  if (!code || !name) return { reason: 'MISSING_CODE_OR_NAME' }
  if (code.length > 10) return { reason: 'CODE_TOO_LONG' }
  if (name.length > 120) return { reason: 'NAME_TOO_LONG' }
  if (/^(XX|YY)-/i.test(code)) return { reason: 'PLACEHOLDER_CODE' }
  if (city.length > 120) return { reason: 'CITY_TOO_LONG' }

  return {
    station: { code, name, city },
    missingCity: city.length === 0,
  }
}

module.exports = { cityFromStation, normalizeStation }
