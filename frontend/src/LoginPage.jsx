import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.message || 'Sign in could not be completed.')
      const returnTo = new URLSearchParams(location.search).get('returnTo')
      navigate(returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/trains', { replace: true })
    } catch (requestError) {
      setError(requestError.message || 'Sign in could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">Passenger account</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Sign in to book</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Use your registered passenger account to continue with a booking.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Email address
            <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Password
            <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          <button disabled={loading} type="submit" className="w-full rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="mt-5 text-sm text-slate-600">Need an account? Register through the passenger registration API.</p>
        <Link to="/trains" className="mt-4 inline-block text-sm font-semibold text-sky-700 hover:text-sky-900">Return to train search</Link>
      </section>
    </main>
  )
}
