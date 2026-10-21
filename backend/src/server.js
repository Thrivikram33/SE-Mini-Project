const path = require('node:path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const express = require('express')
const helmet = require('helmet')
const session = require('express-session')
const pool = require('./config/db')
const authRoutes = require('./routes/auth')
const registrationRoutes = require('./routes/registrationRoutes')

const app = express()
const PORT = Number(process.env.PORT) || 5000

app.disable('x-powered-by')
app.use(helmet())
app.use(express.json({ limit: '10kb' }))

// Session middleware must run before authentication routes.
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in the backend environment.')
}

app.use(
  session({
    name: 'rrs.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60,
    },
  }),
)

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.status(200).json({
      status: 'ok',
      service: 'railway-reservation-api',
      database: 'connected',
    })
  } catch {
    res.status(500).json({
      status: 'error',
      message: 'Database connection failed',
    })
  }
})

// Keep the existing canonical registration endpoint.
app.use('/api/auth/register', registrationRoutes)

// Login, logout, and other authentication routes.
app.use('/api/auth', authRoutes)

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Railway Reservation API listening on port ${PORT}`)
  })
}

module.exports = app
