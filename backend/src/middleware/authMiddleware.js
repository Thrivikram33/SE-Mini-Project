const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      message: 'Authentication required.',
    })
  }

  next()
}

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      message: 'Authentication required.',
    })
  }

  if (!allowedRoles.includes(req.session.user.role)) {
    return res.status(403).json({
      message: 'You are not authorized to access this resource.',
    })
  }

  next()
}

module.exports = { requireAuth, requireRole }
