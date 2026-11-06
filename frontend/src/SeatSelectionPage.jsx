
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

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
  const navigate = useNavigate()
  const [scheduleId, setScheduleId] = useState(
    searchParams.get('scheduleId') || '',
  )
  const [classes, setClasses] = useState([])
  const [classType, setClassType] = useState('')
  const [seats, setSeats] = useState([])
  const [selectedSeats, setSelectedSeats] = useState([])
  const [passengerCount, setPassengerCount] = useState(1)
  const [passengers, setPassengers] = useState([{ name: '', age: '', gender: '' }])
  const [paymentOutcome, setPaymentOutcome] = useState('success')
  const [booking, setBooking] = useState(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [bookingErrors, setBookingErrors] = useState({})
  const [calculatedFare, setCalculatedFare] = useState(null)
  const [fareLoading, setFareLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const source = searchParams.get('source') || ''
  const destination = searchParams.get('destination') || ''

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
    setCalculatedFare(null)

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

  async function calculateTotalFare() {
    setError('')
    setMessage('')
    setFareLoading(true)
    try {
      const response = await fetch(`${API_BASE}/api/fare/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId, classType, passengerCount }),
      })
      const data = await readJson(response)
      setCalculatedFare(data.fare)
    } catch (err) {
      setCalculatedFare(null)
      setError(err.message || 'Unable to calculate the fare.')
    } finally {
      setFareLoading(false)
    }
  }

  function toggleSeat(seat) {
    if (!seat.available) return

    setMessage('')
    setBooking(null)
    setSelectedSeats((current) =>
      current.includes(seat.seatId)
        ? current.filter((id) => id !== seat.seatId)
        : [...current, seat.seatId],
    )
  }

  function updatePassenger(index, field, value) {
    setPassengers((current) => current.map((passenger, passengerIndex) =>
      passengerIndex === index ? { ...passenger, [field]: value } : passenger,
    ))
    setBookingErrors((current) => {
      const next = { ...current }
      delete next[`passengers.${index}.${field}`]
      return next
    })
  }

  async function submitBooking(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBooking(null)
    setBookingErrors({})
    if (selectedSeats.length !== passengerCount) {
      setError('Select exactly one available seat for each passenger.')
      return
    }
    if (!source || !destination) {
      setError('Return to train search and choose this journey so its route is included.')
      return
    }
    setBookingLoading(true)
    try {
      const payload = {
        scheduleId: Number(scheduleId),
        source,
        destination,
        classType,
        seatIds: [...selectedSeats].sort((a, b) => Number(a) - Number(b)),
        passengers: passengers.slice(0, passengerCount),
        ...(import.meta.env.DEV ? { paymentOutcome } : {}),
      }
      const response = await fetch(`${API_BASE}/api/bookings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) {
        if (result.details) setBookingErrors(result.details)
        if (response.status === 401) {
          const returnTo = `${window.location.pathname}${window.location.search}`
          navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)
          return
        }
        throw new Error(result.message || 'Booking could not be completed.')
      }
      setBooking(result.booking)
      setSelectedSeats([])
      navigate('/ticket', { state: { booking: result.booking } })
    } catch (requestError) {
      setError(requestError.message || 'Booking could not be completed.')
    } finally {
      setBookingLoading(false)
    }
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
              onChange={(event) => {
                setScheduleId(event.target.value)
                setCalculatedFare(null)
                setSeats([])
              }}
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
                onClick={() => {
                  setClassType(item.classType)
                  setCalculatedFare(null)
                  setSeats([])
                  setSelectedSeats([])
                }}
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
          <div className="mb-6 flex flex-wrap items-end gap-4 rounded-xl bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-700">
              Passenger count
              <input
                type="number"
                min="1"
                step="1"
                value={passengerCount}
                onChange={(event) => {
                  setPassengerCount(Number(event.target.value))
                  setCalculatedFare(null)
                  setBooking(null)
                  setPassengers((current) => Array.from({ length: Number(event.target.value) || 1 }, (_, index) => current[index] || { name: '', age: '', gender: '' }))
                }}
                className="mt-2 block w-32 rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>
            <button
              type="button"
              onClick={calculateTotalFare}
              disabled={fareLoading || !Number.isSafeInteger(passengerCount) || passengerCount < 1}
              className="rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {fareLoading ? 'Calculating…' : 'Calculate total fare'}
            </button>
            {calculatedFare && (
              <p role="status" className="text-lg font-bold text-slate-900">
                Total fare: {calculatedFare.currency} {calculatedFare.totalFare}
                <span className="ml-2 text-sm font-normal text-slate-600">
                  ({calculatedFare.passengerCount} × {calculatedFare.currency} {calculatedFare.unitFare})
                </span>
              </p>
            )}
          </div>
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

          {selectedSeats.length > 0 && (
            <form onSubmit={submitBooking} className="mt-8 border-t border-slate-200 pt-6">
              <h3 className="text-xl font-bold text-slate-900">Passenger details and payment</h3>
              <p className="mt-2 text-sm text-slate-600">Enter details for each selected seat. The server validates them before starting the booking.</p>
              <div className="mt-4 space-y-4">
                {Array.from({ length: passengerCount }, (_, index) => (
                  <fieldset key={index} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
                    <legend className="px-1 text-sm font-semibold text-slate-700">Passenger {index + 1}</legend>
                    <label className="text-sm font-medium text-slate-700">
                      Full name
                      <input required maxLength="120" value={passengers[index]?.name || ''} onChange={(event) => updatePassenger(index, 'name', event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
                      {bookingErrors[`passengers.${index}.name`] && <span className="mt-1 block text-xs text-red-700">{bookingErrors[`passengers.${index}.name`]}</span>}
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Age
                      <input required type="number" min="1" max="120" step="1" value={passengers[index]?.age || ''} onChange={(event) => updatePassenger(index, 'age', event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
                      {bookingErrors[`passengers.${index}.age`] && <span className="mt-1 block text-xs text-red-700">{bookingErrors[`passengers.${index}.age`]}</span>}
                    </label>
                    <label className="text-sm font-medium text-slate-700">
                      Gender
                      <select required value={passengers[index]?.gender || ''} onChange={(event) => updatePassenger(index, 'gender', event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                        <option value="" disabled>Select one</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                        <option value="UNDISCLOSED">Prefer not to say</option>
                      </select>
                      {bookingErrors[`passengers.${index}.gender`] && <span className="mt-1 block text-xs text-red-700">{bookingErrors[`passengers.${index}.gender`]}</span>}
                    </label>
                  </fieldset>
                ))}
              </div>

              {import.meta.env.DEV && (
                <label className="mt-5 block max-w-sm text-sm font-medium text-slate-700">
                  Simulated payment result (development only)
                  <select value={paymentOutcome} onChange={(event) => setPaymentOutcome(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                    <option value="success">Success</option>
                    <option value="failure">Failure</option>
                  </select>
                </label>
              )}

              <button type="submit" disabled={bookingLoading || selectedSeats.length !== passengerCount} className="mt-5 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">
                {bookingLoading ? 'Processing simulated payment…' : `Pay ${calculatedFare?.currency || 'INR'} ${calculatedFare?.totalFare || ''} and confirm`}
              </button>
            </form>
          )}
        </section>
      )}

      {booking && booking.status === 'CONFIRMED' && (
        <section aria-live="polite" className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-800">Booking confirmed</p>
          <h2 className="mt-2 text-2xl font-bold text-emerald-950">PNR {booking.pnr}</h2>
          <p className="mt-2 text-sm text-emerald-900">{booking.trainName} · {booking.journeyDate} · {booking.classType} · {booking.currency} {booking.totalFare}</p>
          <ul className="mt-4 space-y-1 text-sm text-emerald-950">
            {booking.passengers.map((passenger, index) => <li key={`${passenger.name}-${index}`}>{passenger.name} · seat {passenger.seatNumber}</li>)}
          </ul>
        </section>
      )}
    </main>
  )
}
