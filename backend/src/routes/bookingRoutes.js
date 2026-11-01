const express = require('express')
const { requireRole } = require('../middleware/authMiddleware')
const { createBookingService } = require('../services/bookingService')
const { createPaymentSimulator } = require('../services/paymentSimulator')

const router = express.Router()
const bookingService = createBookingService(undefined, createPaymentSimulator())

router.post('/bookings', requireRole('PASSENGER'), async (req, res, next) => {
  const userId = Number(req.session.user.userId)
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(401).json({ error: 'AUTHENTICATION_REQUIRED', message: 'Authentication required.' })
  }
  try {
    const booking = await bookingService.create(userId, req.body)
    return res.status(201).json({ booking })
  } catch (error) {
    if (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        error: error.code || 'REQUEST_FAILED',
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      })
    }
    return next(error)
  }
})

module.exports = router
