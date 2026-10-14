import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { loadConfig } from '../src/config.js'
import { createDatabase } from '../src/db.js'

const config = loadConfig()
const email = String(process.argv[2] || '').trim().toLowerCase()
if (config.nodeEnv !== 'development' || config.mysql.database !== 'railway_reservation_dev' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Usage: npm run admin:promote-demo -- account@example.test (restricted to railway_reservation_dev development database)')
}

const terminal = readline.createInterface({ input: stdin, output: stdout })
const confirmation = await terminal.question(`Promote ${email} to local demo ADMIN? Type PROMOTE to continue: `)
terminal.close()
if (confirmation !== 'PROMOTE') {
  console.log('No account was changed.')
  process.exit(0)
}

const db = createDatabase(config)
const connection = await db.getConnection()
try {
  await connection.beginTransaction()
  const [users] = await connection.execute(
    'SELECT user_id, role FROM users WHERE email = ? AND active = TRUE FOR UPDATE',
    [email],
  )
  if (!users.length) throw new Error('No active account with that email exists.')
  if (users[0].role === 'ADMIN') {
    await connection.rollback()
    console.log('Account is already an administrator; no change made.')
  } else {
    await connection.execute('UPDATE users SET role = \'ADMIN\' WHERE user_id = ?', [users[0].user_id])
    await connection.execute(
      'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details) VALUES (NULL, ?, ?, ?, JSON_OBJECT(?, ?))',
      ['DEMO_ADMIN_PROMOTION', 'user', String(users[0].user_id), 'email', email],
    )
    await connection.commit()
    console.log(`Promoted ${email} to local demo ADMIN and wrote an audit record.`)
  }
} catch (error) {
  await connection.rollback()
  throw error
} finally {
  connection.release()
  await db.end()
}
