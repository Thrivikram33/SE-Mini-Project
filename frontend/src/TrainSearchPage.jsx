import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { groupTrainsBySchedule } from './trainSearchUtils'

const CLASS_NAMES = {
  '1A': 'First AC',
  '2A': 'Second AC',
  '3A': 'Third AC',
  SL: 'Sleeper',
  CC: 'Chair Car',
  '2S': 'Second Sitting',
}

function localDateString(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDuration(minutes) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function StationInput({ label, value, onChange, onSelect, excludeCode }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const timerRef = useRef(null)
  const requestRef = useRef(null)

  useEffect(() => () => {
    clearTimeout(timerRef.current)
    requestRef.current?.abort()
  }, [])

  async function searchStations(query) {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    try {
      const response = await fetch(
        `/api/trains/stations/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
      if (!response.ok) throw new Error('Station search failed')
      const body = await response.json()
      if (requestRef.current === controller) {
        setSuggestions(
          (body.stations || []).filter(station => station.code !== excludeCode),
        )
        setActive(0)
        setOpen(true)
      }
    } catch (error) {
      if (error.name !== 'AbortError') setSuggestions([])
    }
  }

  function handleChange(event) {
    const query = event.target.value
    onChange(query)
    onSelect(null)
    setSuggestions([])
    setOpen(false)
    clearTimeout(timerRef.current)

    if (query.trim().length >= 1) {
      timerRef.current = setTimeout(() => searchStations(query.trim()), 180)
    }
  }

  function choose(station) {
    onChange(`${station.name} (${station.code})`)
    onSelect(station)
    setOpen(false)
    setSuggestions([])
  }

  function handleKeyDown(event) {
    if (!open || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(index => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(index => (index - 1 + suggestions.length) % suggestions.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(suggestions[active])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <label className="text-sm font-medium text-slate-700">
        {label}
        <input
          required
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (value.trim()) searchStations(value.trim())
          }}
          placeholder="Type station name or code"
          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
        />
      </label>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {suggestions.map((station, index) => (
            <li
              key={station.code}
              role="option"
              aria-selected={active === index}
              onMouseDown={event => event.preventDefault()}
              onClick={() => choose(station)}
              className={`cursor-pointer px-4 py-3 ${
                active === index ? 'bg-sky-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="font-semibold text-slate-900">{station.name}</span>
              <span className="ml-2 text-sm font-medium text-sky-700">
                {station.code}
              </span>
              <span className="block text-xs text-slate-500">
                {station.city}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && value.trim() && suggestions.length === 0 && (
        <p className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow">
          No matching stations found.
        </p>
      )}
    </div>
  )
}

export default function TrainSearchPage() {
  const [source, setSource] = useState('')
  const [destination, setDestination] = useState('')
  const [sourceStation, setSourceStation] = useState(null)
  const [destinationStation, setDestinationStation] = useState(null)
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

    if (!sourceStation || !destinationStation) {
      setError('Please select both stations from the suggestions.')
      setTrains(null)
      return
    }

    if (sourceStation.code === destinationStation.code) {
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

    const params = new URLSearchParams({
      source: sourceStation.code,
      destination: destinationStation.code,
      date,
    })

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
  const groupedTrains = trains === null ? null : groupTrainsBySchedule(trains)

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
          <StationInput
            label="From station"
            value={source}
            onChange={value => {
              setSource(value)
              setTrains(null)
            }}
            onSelect={setSourceStation}
            excludeCode={destinationStation?.code}
          />

          <StationInput
            label="To station"
            value={destination}
            onChange={value => {
              setDestination(value)
              setTrains(null)
            }}
            onSelect={setDestinationStation}
            excludeCode={sourceStation?.code}
          />

          <label className="text-sm font-medium text-slate-700">
            Journey date
            <input
              required
              type="date"
              min={today}
              value={date}
              onChange={event => setDate(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base"
            />
          </label>

          <div className="flex items-end">
            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? 'Searching...' : 'Search trains'}
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
        <p className="mt-6 text-sm text-slate-600" role="status">
          Searching schedules...
        </p>
      )}

      {groupedTrains !== null && (groupedTrains.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-slate-600" role="status">
          No trains match this route and date.
        </p>
      ) : (
        <section className="mt-8 space-y-4" aria-label="Train search results" aria-live="polite">
          <h2 className="text-xl font-bold text-slate-900">
            {groupedTrains.length} train{groupedTrains.length === 1 ? '' : 's'} found
          </h2>
          {groupedTrains.some(train => train.classes.length > 0) && (
            <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Demo fares and seats are simulated project data. Availability is not connected to live railway inventory.
            </p>
          )}

          {groupedTrains.map(train => (
            <article
              key={train.resultKey}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{train.trainName}</h3>
                  <p className="text-sm text-slate-500">Train {train.trainNumber}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                  {train.classes.length} class{train.classes.length === 1 ? '' : 'es'} configured
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

              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  Select a travel class
                </p>
                {train.classes.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {train.classes.map(item => (
                      item.bookable ? <Link
                        key={item.classType}
                        to={`/seats?scheduleId=${encodeURIComponent(train.scheduleId)}&source=${encodeURIComponent(train.source.code)}&destination=${encodeURIComponent(train.destination.code)}`}
                        className="rounded-xl border border-slate-200 p-4 transition hover:border-sky-400 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <span className="font-bold text-sky-700">{item.classType}</span>
                        <span className="mt-1 block font-semibold text-slate-900">
                          {CLASS_NAMES[item.classType] || item.classType}
                        </span>
                        <span className="mt-2 block text-sm text-slate-700">
                          {item.fare
                            ? `${item.fare.currency} ${Number(item.fare.amount).toFixed(2)}`
                            : 'Fare unavailable'}
                        </span>
                        <span className="mt-1 block text-sm text-slate-500">
                          {item.availableSeats} seats available
                        </span>
                        <span className="mt-3 block text-sm font-semibold text-sky-700">
                          Choose class and seats →
                        </span>
                      </Link> : <div
                        key={item.classType}
                        aria-disabled="true"
                        className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-500"
                      >
                        <span className="font-bold">{item.classType}</span>
                        <span className="mt-1 block font-semibold">
                          {CLASS_NAMES[item.classType] || item.classType}
                        </span>
                        <span className="mt-2 block text-sm">
                          {item.fare
                            ? `${item.fare.currency} ${Number(item.fare.amount).toFixed(2)}`
                            : 'Fare unavailable'}
                        </span>
                        <span className="mt-1 block text-sm">
                          {item.availableSeats} seats available
                        </span>
                        <span className="mt-3 block text-sm font-semibold">
                          {item.availableSeats === 0 && item.fare
                            ? 'No seats are currently available.'
                            : 'Booking unavailable: schedule, fare, or seat inventory is not configured.'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    {train.scheduleId == null
                      ? 'The route and operating days are available. Booking is unavailable because no application schedule, fare, coach, or seat inventory is configured.'
                      : 'No classes are currently configured for this train.'}
                  </p>
                )}
              </div>

              <div className="mt-4 text-sm text-slate-500">
                Journey date: {train.journeyDate}
              </div>
            </article>
          ))}
        </section>
      ))}
    </main>
  )
}
