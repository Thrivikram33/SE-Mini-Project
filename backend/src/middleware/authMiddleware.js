const VALID_ROLES = new Set(['PASSENGER', 'ADMIN'])

const isAuthenticatedUser = (user) => (
  user &&
  Number.isSafeInteger(Number(user.userId)) &&
  Number(user.userId) > 0 &&
  VALID_ROLES.has(user.role)
)

const requireAuth = (req, res, next) => {
  if (!req.session || !isAuthenticatedUser(req.session.user)) {
    return res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required.',
    })
  }

  next()
}

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.session || !isAuthenticatedUser(req.session.user)) {
    return res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required.',
    })
  }

  if (
    allowedRoles.length === 0 ||
    !allowedRoles.every((role) => VALID_ROLES.has(role)) ||
    !allowedRoles.includes(req.session.user.role)
  ) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'You are not authorized to access this resource.',
    })
  }

  next()
}

module.exports = { requireAuth, requireRole }