export function validateProductionApiBaseUrl(value) {
  if (!value) return

  if (value.startsWith('/')) {
    let parsedPath
    try {
      parsedPath = new URL(value, 'https://rrs.invalid')
    } catch {
      throw new Error('VITE_API_BASE_URL must be empty, a same-origin path, or an HTTPS origin in production.')
    }

    if (parsedPath.origin === 'https://rrs.invalid' && !parsedPath.search && !parsedPath.hash) return
    throw new Error('VITE_API_BASE_URL must be empty, a same-origin path, or an HTTPS origin in production.')
  }

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('VITE_API_BASE_URL must be empty, a same-origin path, or an HTTPS origin in production.')
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    throw new Error('VITE_API_BASE_URL must be empty, a same-origin path, or an HTTPS origin in production.')
  }
}

export function getFrontendTransportStatus(isProduction, protocol) {
  return !isProduction || protocol === 'https:' ? 'secure' : 'https-required'
}
