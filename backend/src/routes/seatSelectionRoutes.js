
const express = require('express')
const {
  getClassesForSchedule,
  getSeatsForClass,
} = require('../services/seatSelectionService')

const router = express.Router()

router.get('/schedules/:scheduleId/classes', async (req, res, next) => {
  try {
    const classes = await getClassesForSchedule(req.params.scheduleId)
    res.status(200).json({ classes })
  } catch (error) {
    next(error)
  }
})

router.get('/schedules/:scheduleId/seats', async (req, res, next) => {
  try {
    const seats = await getSeatsForClass(
      req.params.scheduleId,
      req.query.classType,
    )
    res.status(200).json({ seats })
  } catch (error) {
    next(error)
  }
})

module.exports = router
