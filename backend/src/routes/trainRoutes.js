
const express = require('express')
const pool = require('../config/db')
const { searchTrains } = require('../services/trainSearchService')

const router = express.Router()

const aliases = {
  bangalore: 'bengaluru',
  banglore: 'bengaluru',
  bengaluru: 'bengaluru',
  mysore: 'mysuru',
  madras: 'chennai',
  bombay: 'mumbai',
}

function normalize(value) {
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase()
  return aliases[normalized] || normalized
}

router.get('/stations/search', async (req, res, next) => {
  try {
    const query = typeof req.query.q === 'string'
      ? req.query.q.trim().replace(/\s+/g, ' ')
      : ''

    if (!query || query.length > 80) {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Enter a station name or code.',
      })
    }

    const normalized = normalize(query)
    const searchTerm = `%${normalized}%`
    const originalTerm = `%${query}%`

    const [stations] = await pool.execute(
      `SELECT station_id AS stationId, code, name, city
       FROM stations
       WHERE LOWER(name) LIKE ?
          OR LOWER(city) LIKE ?
          OR LOWER(code) LIKE ?
          OR LOWER(name) LIKE ?
          OR LOWER(city) LIKE ?
       ORDER BY
         CASE
           WHEN LOWER(code) = LOWER(?) THEN 0
           WHEN LOWER(name) = ? THEN 1
           WHEN LOWER(name) LIKE ? THEN 2
           ELSE 3
         END,
         name
       LIMIT 15`,
      [
        originalTerm,
        originalTerm,
        originalTerm,
        searchTerm,
        searchTerm,
        query,
        normalized,
        `${normalized}%`,
      ],
    )

    return res.status(200).json({ stations })
  } catch (error) {
    return next(error)
  }
})

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

  console.error('Train search request failed.')
  return res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred.',
  })
})

module.exports = router
