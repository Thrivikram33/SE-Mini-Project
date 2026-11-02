const express = require('express')
const { searchTrains } = require('../services/trainSearchService')

const router = express.Router()

router.get('/search', async (req, res, next) => {
  try {
    const trains = await searchTrains(req.query)
    return res.status(200).json({ trains })
  } catch (error) {
    return next(error)
  }
})

router.use((error, _req, res, _next) => {
  if (error.statusCode === 400) {
    return res.status(400).json({
      error: 'INVALID_REQUEST',
      message: error.message,
    })
  }

  // Keep database and driver details out of the shared error logger.
  console.error('Train search request failed.')
  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred.',
  })
})

module.exports = router
