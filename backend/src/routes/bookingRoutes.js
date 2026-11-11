const express = require('express')
const { requireRole } = require('../middleware/authMiddleware')
const { createBookingService } = require('../services/bookingService')
const { createPaymentSimulator } = require('../services/paymentSimulator')

const router = express.Router()
const bookingService = createBookingService(undefined, createPaymentSimulator())

function sendClientError(error, res, next) {
  if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
    return res.status(error.statusCode).json({
      error: error.code || 'REQUEST_FAILED',
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    })
  }
  return next(error)
}

router.get('/bookings', requireRole('PASSENGER'), async (req, res, next) => {
  try {
    const bookings = await bookingService.getPassengerBookings(req.session.user.userId)
    return res.status(200).json({ bookings })
  } catch (error) {
    return sendClientError(error, res, next)
  }
})

router.get('/bookings/:pnr', requireRole('PASSENGER'), async (req, res, next) => {
  try {
    const booking = await bookingService.getPassengerBookingByPnr(
      req.session.user.userId,
      req.params.pnr,
    )
    return res.status(200).json({ booking })
  } catch (error) {
    return sendClientError(error, res, next)
  }
})

router.post('/bookings', requireRole('PASSENGER'), async (req, res, next) => {
  const userId = Number(req.session.user.userId)
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Authentication required.' })
  }
  try {
    const booking = await bookingService.create(userId, req.body, {
      onMetrics: ({ bookingProcessingMs, simulatedPaymentLatencyMs }) => {
        res.setHeader(
          'Server-Timing',
          `booking-processing;dur=${bookingProcessingMs.toFixed(3)}, simulated-payment;dur=${simulatedPaymentLatencyMs.toFixed(3)}`,
        )
      },
    })
    return res.status(201).json({ booking })
  } catch (error) {
    return sendClientError(error, res, next)
  }
})

router.post('/bookings/:bookingId/cancel', requireRole('PASSENGER'), async (req, res, next) => {
  const userId = Number(req.session.user.userId)
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Authentication required.' })
  }
  try {
    const cancellation = await bookingService.cancel(userId, req.params.bookingId)
    return res.status(200).json({ cancellation })
  } catch (error) {
    return sendClientError(error, res, next)
  }
})

module.exports = router
