
const express = require('express')
const { registerPassenger } = require('../services/registrationService')

const router = express.Router()

router.post('/', async (req, res, next) => {
  try {
    const passenger = await registerPassenger(req.body || {})

    return res.status(201).json({
      message: 'Passenger registered successfully.',
      passenger,
    })
  } catch (error) {
    if (error.statusCode === 400 || error.statusCode === 409) {
      return res.status(error.statusCode).json({
        error:
          error.statusCode === 409
            ? 'ACCOUNT_ALREADY_EXISTS'
            : 'VALIDATION_ERROR',
        message: error.message,
      })
    }

    return next(error)
  }
})

module.exports = router
