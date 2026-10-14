import 'dotenv/config'

const required = ['API_JWT_SECRET', 'MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']

export function loadConfig(env = process.env) {
  const missing = required.filter((key) => !env[key])
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`)
  if (env.NODE_ENV === 'production' && env.API_JWT_SECRET.length < 32) {
    throw new Error('API_JWT_SECRET must contain at least 32 characters in production')
  }
  if (env.NODE_ENV === 'production' && !/^https:\/\//i.test(env.PUBLIC_API_URL || '')) {
    throw new Error('PUBLIC_API_URL must use HTTPS in production')
  }
  const refundPercent = Number(env.CANCELLATION_REFUND_PERCENT || 80)
  if (!Number.isFinite(refundPercent) || refundPercent < 0 || refundPercent > 100) {
    throw new Error('CANCELLATION_REFUND_PERCENT must be between 0 and 100')
  }
  return {
    nodeEnv: env.NODE_ENV || 'development',
    port: Number(env.PORT || 4000),
    clientOrigin: env.CLIENT_ORIGIN || 'http://localhost:5173',
    trustProxy: env.TRUST_PROXY === '1',
    cancellationRefundPercent: refundPercent,
    jwtSecret: env.API_JWT_SECRET,
    mysql: {
      host: env.MYSQL_HOST,
      port: Number(env.MYSQL_PORT || 3306),
      user: env.MYSQL_USER,
      password: env.MYSQL_PASSWORD,
      database: env.MYSQL_DATABASE,
      connectionLimit: 10,
      waitForConnections: true,
      queueLimit: 0,
      timezone: 'Z',
    },
  }
}
