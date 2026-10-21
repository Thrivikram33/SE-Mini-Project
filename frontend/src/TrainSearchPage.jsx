import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

function localDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export default function TrainSearchPage() {
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [date, setDate] = useState('')
  const [trains, setTrains] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(null)

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
  }, [])

  async function handleSearch(event) {
    event.preventDefault()
    const from = source.trim()
    const to = destination.trim()
    if (from.toLowerCase() === to.toLowerCase()) {
      setError('Source and destination must be different stations.')
      setTrains(null)
      return
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    setTrains(null)

    const params = new URLSearchParams({ source: from, destination: to, date })
    try {
      const response = await fetch(`/api/trains/search?${params}`, {
        signal: controller.signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message || 'Unable to search trains.')
      if (!Array.isArray(body.trains)) throw new Error('The train search response was invalid.')
      setTrains(body.trains)
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || 'Unable to search trains.')
      }
    } finally {
      if (requestRef.current === controller) setLoading(false)
    }
  }

  const today = localDateString(new Date())

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">
          Journey planner
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Find trains
        </h1>

        <form className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={handleSearch}>
          <label className="text-sm font-medium text-slate-700">
            From station
            <input
              required
              autoComplete="off"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="Station name or code"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To station
            <input
              required
              autoComplete="off"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="Station name or code"
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Journey date
            <input
              required
              type="date"
              min={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </label>
          <div className="flex items-end">
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? 'Searching…' : 'Search trains'}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </section>

      {loading && (
        <p className="mt-6 text-sm text-slate-600" role="status" aria-live="polite">
          Searching schedules…
        </p>
      )}
      {trains !== null && (trains.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600" role="status">
          No trains match this route and date.
        </p>
      ) : (
        <section className="mt-8 space-y-4" aria-label="Train search results" aria-live="polite">
          <h2 className="text-xl font-bold text-slate-900">
            {trains.length} matching option{trains.length === 1 ? '' : 's'}
          </h2>
          {trains.map((train) => (
            <article
              key={`${train.scheduleId}-${train.classType}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{train.trainName}</h3>
                  <p className="text-sm text-slate-500">Train {train.trainNumber}</p>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800">
                  {train.classType}
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <p>
                  <span className="block text-2xl font-semibold text-slate-900">
                    {train.departureTime.slice(0, 5)}
                  </span>
                  <span className="text-sm text-slate-600">
                    {train.source.name} ({train.source.code})
                  </span>
                </p>
                <p className="text-sm text-slate-500 sm:pt-1">
                  {formatDuration(train.durationMinutes)}
                </p>
                <p>
                  <span className="block text-2xl font-semibold text-slate-900">
                    {train.arrivalTime.slice(0, 5)}
                  </span>
                  <span className="text-sm text-slate-600">
                    {train.destination.name} ({train.destination.code})
                    {train.arrivalDaysAfterDeparture > 0 && ` (+${train.arrivalDaysAfterDeparture} day${train.arrivalDaysAfterDeparture === 1 ? '' : 's'})`}
                  </span>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600">
                <span>Journey date: {train.journeyDate}</span>
                <span>Fare: {train.fare.currency} {Number(train.fare.amount).toFixed(2)}</span>
                <span>{train.availableSeats} seats available</span>
                <Link
                  to={`/seats?scheduleId=${encodeURIComponent(train.scheduleId)}`}
                  className="font-semibold text-sky-700 hover:text-sky-900"
                >
                  Choose class and seats
                </Link>
              </div>
            </article>
          ))}
        </section>
      ))}
    </main>
  )
}
