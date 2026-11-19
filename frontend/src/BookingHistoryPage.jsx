import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

function formatMoney(value, currency = 'INR') {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function BookingHistoryPage() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [pnr, setPnr] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancellationError, setCancellationError] = useState('')
  const [cancellationDetails, setCancellationDetails] = useState(null)
  const [cancellingBookingId, setCancellingBookingId] = useState(null)

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

  async function cancelBooking(booking) {
    if (booking.status !== 'CONFIRMED' || cancellingBookingId !== null) return
    const confirmed = window.confirm(
      `Cancel booking ${booking.pnr}? Its seats will be released and the refund will be calculated using the project's cancellation policy. This is a simulated refund record; no real payment will be transferred.`,
    )
    if (!confirmed) return

    setCancellationError('')
    setCancellationDetails(null)
    setCancellingBookingId(String(booking.bookingId))
    try {
      const response = await fetch(
        `${API_BASE}/api/bookings/${encodeURIComponent(booking.bookingId)}/cancel`,
        { method: 'POST', credentials: 'include' },
      )
      const result = await response.json()
      if (response.status === 401) {
        navigate(`/login?returnTo=${encodeURIComponent('/bookings')}`, { replace: true })
        return
      }
      if (!response.ok) {
        throw new Error(result.message || 'Booking could not be cancelled.')
      }

      const cancellation = result.cancellation || {}
      const refundAmount = Number(cancellation.refundAmount)
      if (!Number.isFinite(refundAmount) || refundAmount < 0) {
        throw new Error('The booking was cancelled, but the server returned an invalid refund amount. Refresh booking history to verify the cancellation.')
      }

      setBookings((current) => current.map((item) => (
        String(item.bookingId) === String(booking.bookingId)
          ? { ...item, status: cancellation.status || 'CANCELLED' }
          : item
      )))
      setCancellationDetails({
        pnr: booking.pnr,
        releasedSeatCount: Number(cancellation.releasedSeatCount) || 0,
        refundAmount,
        deductionAmount: Math.max(0, Number(booking.totalFare) - refundAmount),
        refundStatus: cancellation.refundStatus || 'PENDING',
        currency: cancellation.currency || booking.currency || 'INR',
      })
    } catch (requestError) {
      setCancellationError(requestError.message)
    } finally {
      setCancellingBookingId(null)
    }
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
      {cancellationError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">{cancellationError}</p>}
      {cancellationDetails && (
        <section role="status" aria-live="polite" className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
          <h2 className="text-lg font-bold">Booking {cancellationDetails.pnr} cancelled</h2>
          <p className="mt-1 text-sm">{cancellationDetails.releasedSeatCount} {cancellationDetails.releasedSeatCount === 1 ? 'seat has' : 'seats have'} been released.</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Calculated refund</dt>
              <dd className="mt-1 text-xl font-extrabold">{formatMoney(cancellationDetails.refundAmount, cancellationDetails.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Cancellation deduction</dt>
              <dd className="mt-1 text-xl font-bold">{formatMoney(cancellationDetails.deductionAmount, cancellationDetails.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Refund status</dt>
              <dd className="mt-1 text-xl font-bold">{cancellationDetails.refundStatus}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-emerald-900">This amount is calculated and recorded by the project simulator. A PENDING status is not a real bank or payment-provider transfer.</p>
        </section>
      )}
      {!loading && !error && bookings.length === 0 && <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><h2 className="text-xl font-bold text-slate-900">No bookings yet</h2><p className="mt-2 text-slate-600">Confirmed bookings will appear here.</p><Link className="mt-5 inline-flex rounded-lg bg-sky-500 px-5 py-3 font-semibold text-slate-950" to="/trains">Search trains</Link></section>}
      <div className="grid gap-4">
        {bookings.map((booking) => <article key={booking.bookingId} className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div><p className="font-mono text-sm font-bold tracking-wider text-sky-800">PNR {booking.pnr || 'Pending payment'}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{booking.trainNumber} · {booking.trainName}</h2><p className="mt-1 text-sm text-slate-600">{booking.origin?.code || '—'} → {booking.destination?.code || '—'} · {booking.journeyDate || 'Date unavailable'}</p><p className="mt-2 text-sm font-medium text-slate-700">{booking.status} · {booking.currency || 'INR'} {Number(booking.totalFare).toFixed(2)}</p></div>
          <div className="flex flex-wrap gap-2">
            {booking.pnr && booking.status === 'CONFIRMED' && <Link className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-50" to={`/ticket?pnr=${encodeURIComponent(booking.pnr)}`}>View ticket</Link>}
            {booking.status === 'CONFIRMED' && <button
              type="button"
              disabled={cancellingBookingId !== null}
              onClick={() => cancelBooking(booking)}
              aria-label={`Cancel booking ${booking.pnr}`}
              className="rounded-lg border border-red-300 px-4 py-2.5 font-semibold text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancellingBookingId === String(booking.bookingId) ? 'Cancelling…' : 'Cancel booking'}
            </button>}
          </div>
        </article>)}
      </div>
    </main>
  )
}
