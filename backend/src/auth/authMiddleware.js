import jwt from 'jsonwebtoken'
import { ApiError } from '../shared/apiError.js'

function accessToken(req) {
  const authorization = req.get('authorization')
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7)
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('rrs_access='))
  if (!cookie) return null
  try {
    return decodeURIComponent(cookie.slice('rrs_access='.length))
  } catch {
    return null
  }
}

export function requireAuth(secret, users) {
  return async (req, _res, next) => {
    const token = accessToken(req)
    if (!token) return next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to access this resource.'))
    let userId
    try {
      const claims = jwt.verify(token, secret, { issuer: 'rrs-api', audience: 'rrs-client' })
      userId = Number(claims.sub)
      if (!Number.isSafeInteger(userId) || userId < 1) throw new Error('Invalid subject')
    } catch {
      return next(new ApiError(401, 'AUTH_INVALID', 'Your session is invalid or expired. Please sign in again.'))
    }
    try {
      const user = await users.findById(userId)
      if (!user || !user.active) return next(new ApiError(401, 'AUTH_INVALID', 'Your session is invalid or expired. Please sign in again.'))
      req.auth = { userId, role: user.role }
      req.user = { userId: user.userId, name: user.name, email: user.email, mobile: user.mobile, role: user.role }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(new ApiError(401, 'AUTH_REQUIRED', 'Sign in to access this resource.'))
    if (!roles.includes(req.auth.role)) return next(new ApiError(403, 'FORBIDDEN', 'You are not allowed to access this resource.'))
    return next()
  }
}
