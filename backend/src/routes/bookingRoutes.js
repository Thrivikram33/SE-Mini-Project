const express = require('express')
const { requireAuth } = require('../middleware/authMiddleware')
const { createBooking } = require('../services/bookingService')

const router = express.Router()

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { scheduleId, totalFare } = req.body || {}

    const booking = await createBooking({
      userId: req.session.user.userId ?? req.session.user.user_id,
      scheduleId,
      totalFare,
    })

    return res.status(201).json({
      message: 'Booking created successfully. Payment is pending.',
      booking,
    })
  } catch (error) {
    return next(error)
  }
})

module.exports = router