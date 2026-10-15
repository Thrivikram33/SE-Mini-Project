const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const express = require('express')
const helmet = require('helmet')

const app = express()
const PORT = Number(process.env.PORT) || 5000

app.disable('x-powered-by')
app.use(helmet())
app.use(express.json({ limit: '10kb' }))

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'railway-reservation-api',
  })
})

app.use((_req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'The requested resource was not found.',
  })
})

app.use((err, _req, res, _next) => {
  console.error('Request processing failed:', err.message)

  res.status(500).json({
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected server error occurred.',
  })
})

app.listen(PORT, () => {
  console.log(`Railway Reservation API listening on port ${PORT}`)
})