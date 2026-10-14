import { randomUUID } from 'node:crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { errorHandler, notFound } from './middleware/errorHandler.js'
import { createAuthRoutes } from './auth/authRoutes.js'
import { createTrainRepository } from './trains/trainRepository.js'
import { createTrainService } from './trains/trainService.js'
import { createPaymentSimulator } from './bookings/paymentSimulator.js'
import { createBookingRoutes } from './bookings/bookingRoutes.js'
import { createAdminRoutes } from './admin/adminRoutes.js'

export function createApp({ db, config }) {
  const app = express()
  const trains = createTrainService(createTrainRepository(db))
  const paymentSimulator = createPaymentSimulator({ nodeEnv: config.nodeEnv })

  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxy ? 1 : false)
  app.use(helmet())
  app.use(cors({ origin: config.clientOrigin, credentials: true }))
  app.use((req, res, next) => {
    req.requestId = randomUUID()
    res.setHeader('X-Request-Id', req.requestId)
    next()
  })
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }))
  app.use('/api/auth', createAuthRoutes({ db, config }))
  app.use('/api/bookings', createBookingRoutes({ db, config, paymentSimulator }))
  app.use('/api/admin', createAdminRoutes({ db, config, paymentSimulator }))

  app.get('/api/health/live', (_req, res) => res.json({ status: 'ok' }))
  app.get('/api/health', async (_req, res, next) => {
    try {
      await db.query('SELECT 1')
      res.json({ status: 'ok', database: 'connected' })
    } catch (error) {
      next(error)
    }
  })
  app.get('/api/stations', async (_req, res, next) => {
    try {
      res.json({ data: await trains.listStations() })
    } catch (error) { next(error) }
  })
  app.get('/api/trains/:scheduleId/availability', async (req, res, next) => {
    try {
      res.json({ data: await trains.getAvailability(req.params.scheduleId) })
    } catch (error) { next(error) }
  })
  app.get('/api/trains/search', async (req, res, next) => {
    try {
      const results = await trains.search(req.query)
      res.json({ data: results })
    } catch (error) {
      next(error)
    }
  })

  app.use(notFound)
  app.use(errorHandler)
  return app
}
