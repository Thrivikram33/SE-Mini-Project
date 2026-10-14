import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { ApiError } from '../shared/apiError.js'

function userView(user) {
  return { userId: user.userId, name: user.name, email: user.email, mobile: user.mobile, role: user.role }
}

export function createAuthService(users, jwtSecret) {
  return {
    async register(input) {
      const name = String(input.name || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const mobile = String(input.mobile || '').trim()
      const password = String(input.password || '')
      const errors = {}
      if (name.length < 2 || name.length > 120 || /[\u0000-\u001f]/.test(name)) errors.name = 'Enter a name between 2 and 120 characters.'
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.'
      const digits = mobile.replace(/\D/g, '')
      if (!/^[+\d][+\d ()-]{5,23}$/.test(mobile) || digits.length < 7 || digits.length > 15) errors.mobile = 'Enter a valid mobile number.'
      const passwordBytes = Buffer.byteLength(password, 'utf8')
      if (password.length < 10 || passwordBytes > 72) errors.password = 'Password must be at least 10 characters and no more than 72 bytes.'
      if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', errors)

      const passwordHash = await bcrypt.hash(password, 12)
      try {
        return await users.create({ name, email, mobile, passwordHash })
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new ApiError(409, 'EMAIL_EXISTS', 'An account with this email already exists.')
        throw error
      }
    },

    async login(input) {
      const email = String(input.email || '').trim().toLowerCase()
      const password = String(input.password || '')
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || Buffer.byteLength(password) > 72) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
      }
      const user = await users.findByEmail(email)
      const matches = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEe.2pAS5jF6eVw2W0v6iTnXQ9hY4zd1r7K')
      if (!user || !user.active || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
      const token = jwt.sign({ role: user.role }, jwtSecret, {
        subject: String(user.userId),
        issuer: 'rrs-api',
        audience: 'rrs-client',
        expiresIn: '1h',
      })
      return { token, user: userView(user) }
    },
  }
}
