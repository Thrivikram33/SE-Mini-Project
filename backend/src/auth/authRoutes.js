import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { createAuthService } from './authService.js'
import { createUserRepository } from './userRepository.js'
import { requireAuth } from './authMiddleware.js'

export function createAuthRoutes({ db, config }) {
  const router = Router()
  const users = createUserRepository(db)
  const auth = createAuthService(users, config.jwtSecret)
  const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: 60 * 60 * 1000,
  }
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false })

  router.post('/register', async (req, res, next) => {
    try {
      const user = await auth.register(req.body || {})
      res.status(201).json({ data: user })
    } catch (error) { next(error) }
  })
  router.post('/login', loginLimit, async (req, res, next) => {
    try {
      const result = await auth.login(req.body || {})
      res.cookie('rrs_access', result.token, cookieOptions)
      res.json({ data: result.user })
    } catch (error) { next(error) }
  })
  router.post('/logout', (_req, res) => {
    res.clearCookie('rrs_access', { ...cookieOptions, maxAge: undefined })
    res.status(204).end()
  })
  router.get('/me', requireAuth(config.jwtSecret, users), (req, res) => {
    res.json({ data: req.user })
  })
  return router
}
