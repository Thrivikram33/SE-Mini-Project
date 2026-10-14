import { loadConfig } from './config.js'
import { createDatabase } from './db.js'
import { createApp } from './app.js'

let config
let db
try {
  config = loadConfig()
  db = createDatabase(config)
  const app = createApp({ db, config })
  const server = app.listen(config.port, () => {
    console.log(`RRS API listening on port ${config.port}`)
  })

  async function shutdown(signal) {
    console.log(`Received ${signal}; closing API and database pool.`)
    server.close(async () => {
      await db.end()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
} catch (error) {
  console.error(`API startup failed: ${error.message}`)
  process.exitCode = 1
}
