
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function RegistrationPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  function handleChange(event) {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (form.name.trim().length < 2) {
      setError('Name must contain at least 2 characters.')
      return
    }

    if (form.password.length < 8 || form.password.length > 72) {
      setError('Password must contain 8 to 72 characters.')
      return
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          mobile: form.mobile.trim(),
          password: form.password,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Registration failed.')
      }

      setSuccess('Registration successful! You can now sign in.')

      setForm({
        name: '',
        email: '',
        mobile: '',
        password: '',
        confirmPassword: '',
      })

      setTimeout(() => navigate('/login'), 1500)
    } catch (requestError) {
      setError(requestError.message || 'Unable to register. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100'

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">
          Passenger account
        </p>

        <h1 className="mt-2 text-3xl font-bold text-slate-900">
          Create your account
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-600">
          Register to search trains and manage your railway bookings.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Full name *
            <input
              required
              name="name"
              value={form.name}
              onChange={handleChange}
              minLength={2}
              maxLength={120}
              autoComplete="name"
              className={inputClass}
              placeholder="Enter your full name"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email address *
            <input
              required
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              maxLength={254}
              autoComplete="email"
              className={inputClass}
              placeholder="you@example.com"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Mobile number
            <input
              type="tel"
              name="mobile"
              value={form.mobile}
              onChange={handleChange}
              maxLength={20}
              autoComplete="tel"
              className={inputClass}
              placeholder="Enter mobile number"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Password *
            <input
              required
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className={inputClass}
              placeholder="Minimum 8 characters"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Confirm password *
            <input
              required
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className={inputClass}
              placeholder="Re-enter your password"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}

          {success && (
            <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
              {success}
            </p>
          )}

          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-sky-700 hover:text-sky-900">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  )
}
