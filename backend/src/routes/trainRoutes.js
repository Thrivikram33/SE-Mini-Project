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

module.exports = router
