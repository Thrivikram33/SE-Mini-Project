const express = require('express')
const { calculateFare } = require('../services/fareCalculationService')

const router = express.Router()

router.post('/fare/calculate', async (req, res, next) => {
  try {
    if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
      const error = new Error('A JSON request body is required.')
      error.statusCode = 400
      throw error
    }
    const result = await calculateFare(req.body)
    return res.status(200).json({ fare: result })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
