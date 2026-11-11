const PRODUCTION = 'production'

function parseHttpsUrl(value, name, { originOnly = false } = {}) {
  let parsed

  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL in production.`)
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (originOnly && parsed.pathname !== '/')
  ) {
    throw new Error(`${name} must be a valid HTTPS ${originOnly ? 'origin' : 'URL'} in production.`)
  }

  return parsed
}

function getTransportSecurityConfig(env = process.env) {
  if (env.NODE_ENV !== PRODUCTION) {
    return { production: false, trustProxyHops: 0, clientOrigin: undefined }
  }

  parseHttpsUrl(env.PUBLIC_API_URL, 'PUBLIC_API_URL')
  const clientOrigin = parseHttpsUrl(env.CLIENT_ORIGIN, 'CLIENT_ORIGIN', { originOnly: true }).origin
  const trustProxyValue = env.TRUST_PROXY

  if (!/^[1-9]\d*$/.test(trustProxyValue || '')) {
    throw new Error('TRUST_PROXY must be an integer from 1 to 10 in production.')
  }

  const trustProxyHops = Number(trustProxyValue)
  if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops > 10) {
    throw new Error('TRUST_PROXY must be an integer from 1 to 10 in production.')
  }

  return { production: true, trustProxyHops, clientOrigin }
}

function requireSecureTransport(req, res, next) {
  if (req.secure) return next()

  return res.status(426).json({
    error: 'HTTPS_REQUIRED',
    message: 'Use HTTPS to communicate with this service.',
  })
}

module.exports = { getTransportSecurityConfig, requireSecureTransport }
