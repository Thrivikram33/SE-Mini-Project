const DATABASE_NAME = 'railway_reservation_dev'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

function assertDevelopmentTarget(env = process.env) {
  const host = String(env.DB_HOST || '').trim().toLowerCase()
  if (
    env.NODE_ENV !== 'development' ||
    env.DB_NAME !== DATABASE_NAME ||
    !LOCAL_HOSTS.has(host)
  ) {
    throw new Error(
      `Refusing database operation: use NODE_ENV=development, DB_HOST=localhost/127.0.0.1/::1, and DB_NAME=${DATABASE_NAME} in backend/.env.`,
    )
  }
}

async function verifyDevelopmentConnection(connection) {
  const [[identity]] = await connection.query(
    'SELECT DATABASE() AS databaseName, @@hostname AS hostname, @@port AS port, VERSION() AS version',
  )
  if (identity.databaseName !== DATABASE_NAME) {
    throw new Error(`Connected database was "${identity.databaseName}"; expected "${DATABASE_NAME}".`)
  }
  return identity
}

module.exports = {
  DATABASE_NAME,
  assertDevelopmentTarget,
  verifyDevelopmentConnection,
}
