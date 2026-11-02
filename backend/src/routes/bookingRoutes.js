const express = require('express')
const {
  createBooking,
  confirmBooking,
  releaseHeldAllocations,
  getBookingAllocations,
} = require('../services/bookingService')

const router = express.Router()

router.post('/', async (req, res, next) => {
  try {
    const data = await createBooking(req.body || {}, req.user?.id)
    return res.status(201).json({ booking: data })
  } catch (error) {
    return next(error)
  }
})

router.post('/:bookingId/confirm', async (req, res, next) => {
  try {
    const booking = await confirmBooking(req.params.bookingId)
    return res.status(200).json({ booking })
  } catch (error) {
    return next(error)
  }
})

router.post('/:bookingId/release', async (req, res, next) => {
  try {
    const booking = await releaseHeldAllocations(req.params.bookingId)
    return res.status(200).json({ booking })
  } catch (error) {
    return next(error)
  }
})

router.get('/:bookingId/allocations', async (req, res, next) => {
  try {
    const allocations = await getBookingAllocations(req.params.bookingId)
    return res.status(200).json({ allocations })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
