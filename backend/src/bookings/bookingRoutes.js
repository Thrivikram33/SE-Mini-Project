import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/authMiddleware.js'
import { createUserRepository } from '../auth/userRepository.js'
import { createBookingService } from './bookingService.js'
import { createBookingQueryRepository } from './bookingQueryRepository.js'
import { createCancellationService } from './cancellationService.js'

export function createBookingRoutes({ db, config, paymentSimulator }) {
  const router = Router()
  const auth = requireAuth(config.jwtSecret, createUserRepository(db))
  const bookings = createBookingService(db, paymentSimulator)
  const bookingQueries = createBookingQueryRepository(db)
  const cancellations = createCancellationService(db, paymentSimulator, { refundPercent: config.cancellationRefundPercent })

  router.post('/', auth, requireRole('PASSENGER'), async (req, res, next) => {
    try {
      const result = await bookings.create(req.auth.userId, req.body || {})
      res.status(201).json({ data: result })
    } catch (error) { next(error) }
  })
  router.get('/', auth, async (req, res, next) => {
    try {
      if (req.auth.role !== 'PASSENGER') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only passengers can access this booking history.', requestId: req.requestId } })
      }
      res.json({ data: await bookingQueries.listByUser(req.auth.userId) })
    } catch (error) {
      next(error)
    }
  })
  router.get('/:pnr', auth, async (req, res, next) => {
    try {
      const booking = await bookingQueries.findByPnr(req.params.pnr.toUpperCase())
      if (!booking) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking was not found.', requestId: req.requestId } })
      if (booking.userId !== req.auth.userId && req.auth.role !== 'ADMIN') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not allowed to view this booking.', requestId: req.requestId } })
      }
      return res.json({ data: booking })
    } catch (error) { return next(error) }
  })
  router.get('/:pnr/cancellation-quote', auth, async (req, res, next) => {
    try {
      const result = await cancellations.quote(req.auth.userId, req.params.pnr)
      res.json({ data: result })
    } catch (error) { next(error) }
  })
  router.post('/:pnr/cancel', auth, async (req, res, next) => {
    try {
      const result = await cancellations.cancel(req.auth.userId, req.params.pnr, req.body || {}, { isAdmin: req.auth.role === 'ADMIN' })
      res.json({ data: result })
    } catch (error) { next(error) }
  })
  return router
}
