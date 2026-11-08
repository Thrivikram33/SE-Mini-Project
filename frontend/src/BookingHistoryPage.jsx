import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

export default function BookingHistoryPage() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [pnr, setPnr] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch(`${API_BASE}/api/bookings`, { credentials: 'include' })
      .then(async (response) => {
        const result = await response.json()
        if (response.status === 401) {
          navigate(`/login?returnTo=${encodeURIComponent('/bookings')}`, { replace: true })
          return null
        }
        if (!response.ok) throw new Error(result.message || 'Booking history could not be loaded.')
        return result.bookings || []
      })
      .then((result) => { if (active && result) setBookings(result) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate])

  function openPnr(event) {
    event.preventDefault()
    const value = pnr.trim().toUpperCase()
    if (value) navigate(`/ticket?pnr=${encodeURIComponent(value)}`)
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-7">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">Passenger account</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">My bookings</h1>
        <p className="mt-2 text-slate-600">Your booking history and ticket details.</p>
      </header>
      <form onSubmit={openPnr} className="mb-7 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row">
        <label className="flex-1 text-sm font-semibold text-slate-700" htmlFor="pnr">Retrieve a ticket by PNR
          <input id="pnr" value={pnr} onChange={(event) => setPnr(event.target.value)} maxLength={12} autoCapitalize="characters" autoComplete="off" placeholder="Enter your 12-character PNR" className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 font-mono uppercase" />
        </label>
        <button className="self-end rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700">Find ticket</button>
      </form>
      {loading && <p role="status" className="py-8 text-slate-600">Loading your bookings…</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
      {!loading && !error && bookings.length === 0 && <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><h2 className="text-xl font-bold text-slate-900">No bookings yet</h2><p className="mt-2 text-slate-600">Confirmed bookings will appear here.</p><Link className="mt-5 inline-flex rounded-lg bg-sky-500 px-5 py-3 font-semibold text-slate-950" to="/trains">Search trains</Link></section>}
      <div className="grid gap-4">
        {bookings.map((booking) => <article key={booking.bookingId} className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><p className="font-mono text-sm font-bold tracking-wider text-sky-800">PNR {booking.pnr || 'Pending payment'}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{booking.trainNumber} · {booking.trainName}</h2><p className="mt-1 text-sm text-slate-600">{booking.origin?.code || '—'} → {booking.destination?.code || '—'} · {booking.journeyDate || 'Date unavailable'}</p><p className="mt-2 text-sm font-medium text-slate-700">{booking.status} · {booking.currency || 'INR'} {Number(booking.totalFare).toFixed(2)}</p></div>
          {booking.pnr && <Link className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" to={`/ticket?pnr=${encodeURIComponent(booking.pnr)}`}>View ticket</Link>}
        </article>)}
      </div>
    </main>
  )
}
