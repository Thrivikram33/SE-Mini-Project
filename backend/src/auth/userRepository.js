export function createUserRepository(db) {
  return {
    async findById(userId) {
      const [rows] = await db.execute(
        'SELECT user_id AS userId, name, email, mobile, role, active FROM users WHERE user_id = ? LIMIT 1',
        [userId],
      )
      return rows[0] || null
    },
    async findByEmail(email) {
      const [rows] = await db.execute(
        'SELECT user_id AS userId, name, email, mobile, password_hash AS passwordHash, role, active FROM users WHERE email = ? LIMIT 1',
        [email],
      )
      return rows[0] || null
    },
    async create({ name, email, mobile, passwordHash }) {
      const [result] = await db.execute(
        'INSERT INTO users (name, email, mobile, password_hash, role) VALUES (?, ?, ?, ?, \'PASSENGER\')',
        [name, email, mobile, passwordHash],
      )
      return { userId: result.insertId, name, email, mobile, role: 'PASSENGER' }
    },
  }
}
