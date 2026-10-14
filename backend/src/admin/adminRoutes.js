import { Router } from 'express'
import { requireAuth, requireRole } from '../auth/authMiddleware.js'
import { createUserRepository } from '../auth/userRepository.js'
import { createAdminService } from './adminService.js'
import { createCancellationService } from '../bookings/cancellationService.js'
import { createBookingQueryRepository } from '../bookings/bookingQueryRepository.js'

export function createAdminRoutes({ db, config, paymentSimulator }) {
  const router = Router()
  router.use(requireAuth(config.jwtSecret, createUserRepository(db)))
  router.use(requireRole('ADMIN'))
  const admin = createAdminService(db)
  const cancellations = createCancellationService(db, paymentSimulator, { refundPercent: config.cancellationRefundPercent })
  const bookingQueries = createBookingQueryRepository(db)

  router.get('/trains', async (_req, res, next) => {
    try { res.json({ data: await admin.listTrains() }) } catch (error) { next(error) }
  })
  router.post('/trains', async (req, res, next) => {
    try { res.status(201).json({ data: await admin.createTrain(req.body || {}, req.auth.userId) }) } catch (error) { next(error) }
  })
  router.put('/trains/:trainId', async (req, res, next) => {
    try { res.json({ data: await admin.updateTrain(req.params.trainId, req.body || {}, req.auth.userId) }) } catch (error) { next(error) }
  })
  router.get('/trains/:trainId/route', async (req, res, next) => {
    try { res.json({ data: await admin.getRoute(req.params.trainId) }) } catch (error) { next(error) }
  })
  router.put('/trains/:trainId/route', async (req, res, next) => {
    try { res.json({ data: await admin.updateRoute(req.params.trainId, req.body || {}, req.auth.userId) }) } catch (error) { next(error) }
  })
  router.get('/schedules', async (req, res, next) => {
    try { res.json({ data: await admin.listSchedules(req.query) }) } catch (error) { next(error) }
  })
  router.post('/schedules', async (req, res, next) => {
    try { res.status(201).json({ data: await admin.createSchedule(req.body || {}, req.auth.userId) }) } catch (error) { next(error) }
  })
  router.put('/schedules/:scheduleId', async (req, res, next) => {
    try { res.json({ data: await admin.updateSchedule(req.params.scheduleId, req.body || {}, req.auth.userId) }) } catch (error) { next(error) }
  })
  router.get('/bookings', async (req, res, next) => {
    try { res.json({ data: await admin.listBookings(req.query) }) } catch (error) { next(error) }
  })
  router.get('/bookings/:pnr', async (req, res, next) => {
    try {
      const booking = await bookingQueries.findByPnr(req.params.pnr.toUpperCase())
      if (!booking) return res.status(404).json({ error: { code: 'BOOKING_NOT_FOUND', message: 'Booking was not found.', requestId: req.requestId } })
      return res.json({ data: booking })
    } catch (error) { return next(error) }
  })
  router.get('/bookings/:pnr/cancellation-quote', async (req, res, next) => {
    try {
      res.json({ data: await cancellations.quote(req.auth.userId, req.params.pnr, { isAdmin: true }) })
    } catch (error) { next(error) }
  })
  router.post('/bookings/:pnr/cancel', async (req, res, next) => {
    try {
      const result = await cancellations.cancel(req.auth.userId, req.params.pnr, req.body || {}, { isAdmin: true })
      res.json({ data: result })
    } catch (error) { next(error) }
  })
  router.get('/audit', async (req, res, next) => {
    try { res.json({ data: await admin.listAuditLogs(req.query.limit) }) } catch (error) { next(error) }
  })
  return router
}
