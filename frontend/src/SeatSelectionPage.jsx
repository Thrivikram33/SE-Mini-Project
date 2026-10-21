
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

const CLASS_NAMES = {
  '1A': 'First AC',
  '2A': 'Second AC',
  '3A': 'Third AC',
  SL: 'Sleeper',
  CC: 'Chair Car',
  '2S': 'Second Sitting',
}

export default function SeatSelectionPage() {
  const [searchParams] = useSearchParams()
  const [scheduleId, setScheduleId] = useState(
    searchParams.get('scheduleId') || '',
  )
  const [classes, setClasses] = useState([])
  const [classType, setClassType] = useState('')
  const [seats, setSeats] = useState([])
  const [selectedSeats, setSelectedSeats] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function readJson(response) {
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.message || 'Unable to load seat information.')
    }
    return data
  }

  async function searchClasses(event) {
    event?.preventDefault()
    setError('')
    setMessage('')
    setClasses([])
    setSeats([])
    setSelectedSeats([])
    setClassType('')

    if (!/^[1-9]\d*$/.test(scheduleId)) {
      setError('Enter a valid schedule ID.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(
        `${API_BASE}/api/schedules/${encodeURIComponent(scheduleId)}/classes`,
      )
      const data = await readJson(response)
      setClasses(data.classes || [])
      if (!data.classes?.length) {
        setMessage('No travel classes are configured for this schedule.')
      }
    } catch (err) {
      setError(err.message || 'Unable to load travel classes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!classType || !scheduleId) {
      setSeats([])
      return
    }

    const controller = new AbortController()

    async function loadSeats() {
      setLoading(true)
      setError('')
      setMessage('')
      setSelectedSeats([])

      try {
        const url = new URL(
          `${API_BASE}/api/schedules/${encodeURIComponent(scheduleId)}/seats`,
        )
        url.searchParams.set('classType', classType)

        const response = await fetch(url, { signal: controller.signal })
        const data = await readJson(response)
        setSeats(data.seats || [])
        if (!data.seats?.length) {
          setMessage('No seats are configured for this class.')
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Unable to load seats.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadSeats()
    return () => controller.abort()
  }, [scheduleId, classType])

  function toggleSeat(seat) {
    if (!seat.available) return

    setMessage('')
    setSelectedSeats((current) =>
      current.includes(seat.seatId)
        ? current.filter((id) => id !== seat.seatId)
        : [...current, seat.seatId],
    )
  }

  const coaches = [...new Set(seats.map((seat) => seat.coachId))]

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-300">
          Railway Reservation System · RRS-F-005
        </p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
          Class & seat selection
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-slate-300">
          Choose a scheduled journey, select your travel class, and explore
          available seats and berths.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <form onSubmit={searchClasses} className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-sm font-semibold text-slate-700">
            Schedule ID
            <input
              value={scheduleId}
              onChange={(event) => setScheduleId(event.target.value)}
              inputMode="numeric"
              required
              pattern="[1-9][0-9]*"
              placeholder="Enter a schedule ID"
              className="mt-2 block w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="self-end rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
          >
            Load classes
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
            {message}
          </p>
        )}
      </section>

      {classes.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900">Choose your class</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes.map((item) => (
              <button
                type="button"
                key={item.classType}
                onClick={() => setClassType(item.classType)}
                aria-pressed={classType === item.classType}
                className={`rounded-2xl border p-5 text-left transition ${
                  classType === item.classType
                    ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-100'
                    : 'border-slate-200 bg-white hover:border-sky-300'
                }`}
              >
                <span className="text-sm font-bold text-sky-700">
                  {item.classType}
                </span>
                <span className="mt-2 block text-lg font-bold text-slate-900">
                  {CLASS_NAMES[item.classType] || item.classType}
                </span>
                <span className="mt-2 block text-sm text-slate-600">
                  {item.currency || 'INR'} {Number(item.fare).toFixed(2)}
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  {item.availableSeats} seats available · {item.coachCount} coaches
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {classType && (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Select seats · {CLASS_NAMES[classType] || classType}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Choose only seats marked available. Your selection is not a booking.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-600">
              <span>🟩 Available</span>
              <span>🟦 Selected</span>
              <span>⬜ Unavailable</span>
            </div>
          </div>

          {coaches.map((coachId) => {
            const coachSeats = seats.filter((seat) => seat.coachId === coachId)
            return (
              <div key={coachId} className="mt-6 rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-800">
                  Coach {coachSeats[0]?.coachNumber}
                </h3>
                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-8">
                  {coachSeats.map((seat) => {
                    const selected = selectedSeats.includes(seat.seatId)
                    return (
                      <button
                        type="button"
                        key={seat.seatId}
                        disabled={!seat.available}
                        onClick={() => toggleSeat(seat)}
                        aria-pressed={selected}
                        aria-label={`Seat ${seat.seatNumber}, ${seat.berthType}, ${
                          selected ? 'selected' : seat.available ? 'available' : 'unavailable'
                        }`}
                        className={`rounded-xl border p-3 text-center text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected
                            ? 'border-sky-600 bg-sky-600 text-white'
                            : seat.available
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                              : 'border-slate-200 bg-slate-100 text-slate-400'
                        }`}
                      >
                        <span className="block font-bold">{seat.seatNumber}</span>
                        <span className="mt-1 block text-xs">{seat.berthType}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
            <p className="text-sm text-slate-600" aria-live="polite">
              {selectedSeats.length} seat(s) selected
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedSeats([])
                setMessage('Your seat selection has been cleared.')
              }}
              disabled={selectedSeats.length === 0}
              className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Clear selection
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
