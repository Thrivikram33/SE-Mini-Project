import { useEffect, useState } from 'react'
import {
  cancelBooking,
  getBooking,
  getCancellationQuote,
  getCurrentUser,
  getMyBookings,
  getStations,
  searchTrains,
  signOut,
} from './api/client.js'
import TrainHero from './components/TrainHero.jsx'
import AuthDialog from './components/AuthDialog.jsx'
import BookingDialog from './components/BookingDialog.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import './App.css'

const sampleTrains = [
  {
    id: 1,
    name: 'Shatabdi Express',
    number: '12027',
    from: 'SBC',
    to: 'MAS',
    departure: '06:00',
    arrival: '10:50',
    duration: '4h 50m',
    classes: ['CC', 'EC'],
    fares: { CC: 850, EC: 1650 },
  },
  {
    id: 2,
    name: 'Brindavan Express',
    number: '12639',
    from: 'SBC',
    to: 'MAS',
    departure: '07:50',
    arrival: '13:10',
    duration: '5h 20m',
    classes: ['2S', 'CC'],
    fares: { '2S': 220, CC: 620 },
  },
  {
    id: 3,
    name: 'Lalbagh Express',
    number: '12608',
    from: 'SBC',
    to: 'MAS',
    departure: '15:30',
    arrival: '21:15',
    duration: '5h 45m',
    classes: ['2S', 'CC'],
    fares: { '2S': 200, CC: 580 },
  },
]

function App() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [journeyDate, setJourneyDate] = useState('')
  const [travelClass, setTravelClass] = useState('All classes')
  const [searched, setSearched] = useState(false)
  const [searchState, setSearchState] = useState('idle')
  const [searchResults, setSearchResults] = useState([])
  const [stations, setStations] = useState([])
  const [apiAvailable, setApiAvailable] = useState(null)
  const [message, setMessage] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [pendingTrain, setPendingTrain] = useState(null)
  const [bookingTrain, setBookingTrain] = useState(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [bookingHistory, setBookingHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [pnrInput, setPnrInput] = useState('')
  const [retrievedBooking, setRetrievedBooking] = useState(null)
  const [accountError, setAccountError] = useState('')
  const [cancellationQuote, setCancellationQuote] = useState(null)
  const [cancellationBusy, setCancellationBusy] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  useEffect(() => {
    getStations()
      .then((data) => { setStations(data); setApiAvailable(true) })
      .catch(() => setApiAvailable(false))
    getCurrentUser().then(setCurrentUser).catch(() => {})
  }, [])

  const today = new Date()
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const visibleTrains = searched
    ? searchResults.map((train) => ({
      id: `${train.scheduleId}-${train.classType}`,
      name: train.trainName,
      number: train.trainNumber,
      from: train.sourceCode,
      to: train.destinationCode,
      departure: train.departureTime.slice(0, 5),
      arrival: train.arrivalTime.slice(0, 5),
      duration: `${Math.floor(train.durationMinutes / 60)}h ${train.durationMinutes % 60}m`,
      classes: [train.classType],
      fares: { [train.classType]: train.fare },
      availableSeats: train.availableSeats,
      isDemo: false,
    }))
    : sampleTrains.filter((train) => travelClass === 'All classes' || train.classes.includes(travelClass))

  function swapStations() {
    setFrom(to)
    setTo(from)
  }

  function stationCode(value) {
    const normalized = value.trim().toLocaleLowerCase()
    const station = stations.find((item) => item.code.toLocaleLowerCase() === normalized || item.name.toLocaleLowerCase() === normalized)
    return station?.code || (/^[a-z0-9]{2,10}$/i.test(value.trim()) ? value.trim().toUpperCase() : '')
  }

  async function searchJourneys(event) {
    event.preventDefault()
    setSearched(true)
    setMessage('')
    setSearchResults([])
    setSearchState('loading')
    const source = stationCode(from)
    const destination = stationCode(to)
    if (!source || !destination) {
      setSearchState('error')
      setMessage('Choose a station from the suggestions or enter its station code.')
      return
    }
    if (source === destination) {
      setSearchState('error')
      setMessage('Choose different departure and arrival stations.')
      return
    }
    try {
      const data = await searchTrains({
        source,
        destination,
        date: journeyDate,
        classType: travelClass === 'All classes' ? undefined : travelClass,
      })
      setSearchResults(data)
      setSearchState('success')
    } catch (error) {
      setMessage(error.message)
      setSearchState('error')
    }
  }

  function selectTrain(train) {
    if (train.isDemo !== false) {
      setMessage(`${train.name} (${train.number}) is sample content. Sample trains cannot be booked.`)
      return
    }
    if (currentUser?.role === 'ADMIN') {
      setMessage('Passenger accounts are required to make bookings.')
      return
    }
    if (!currentUser) {
      setPendingTrain(train)
      setAuthMode('login')
      return
    }
    setBookingTrain(train)
  }

  async function openMyBookings() {
    if (!currentUser) {
      setAuthMode('login')
      return
    }
    if (currentUser.role !== 'PASSENGER') {
      setMessage('Passenger booking history is available to passenger accounts.')
      return
    }
    setAccountOpen(true)
    setAccountError('')
    setHistoryLoading(true)
    try {
      setBookingHistory(await getMyBookings())
      document.getElementById('account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (error) {
      setAccountError(error.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function retrievePnr(event) {
    event.preventDefault()
    setAccountError('')
    setRetrievedBooking(null)
    try {
      setRetrievedBooking(await getBooking(pnrInput.trim().toUpperCase()))
    } catch (error) {
      setAccountError(error.message)
    }
  }

  async function viewTicket(pnr) {
    setAccountError('')
    try { setRetrievedBooking(await getBooking(pnr)) } catch (error) { setAccountError(error.message) }
  }

  async function requestCancellation(pnr) {
    setAccountError('')
    try {
      setCancellationQuote(await getCancellationQuote(pnr))
    } catch (error) {
      setAccountError(error.message)
    }
  }

  async function confirmCancellation() {
    if (!cancellationQuote) return
    setCancellationBusy(true)
    setAccountError('')
    try {
      const cancellation = await cancelBooking(cancellationQuote.pnr)
      setCancellationQuote(null)
      setBookingHistory(await getMyBookings())
      if (retrievedBooking?.pnr === cancellationQuote.pnr) setRetrievedBooking(await getBooking(cancellationQuote.pnr))
      setMessage(`Booking ${cancellationQuote.pnr} cancelled. Simulated refund: ₹${cancellation.refundAmount.toLocaleString('en-IN')} (${cancellation.refundStatus}).`)
    } catch (error) {
      setAccountError(error.message)
    } finally {
      setCancellationBusy(false)
    }
  }

  async function logOut() {
    try {
      await signOut()
      setCurrentUser(null)
      setAccountOpen(false)
      setBookingHistory([])
      setRetrievedBooking(null)
      setMessage('You are signed out.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  return (
    <div className="railway-app">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Railway Reservation home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>
            <strong>Railway</strong>
            <small>RESERVATION SYSTEM</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#home">Home</a>
          <a className="nav-link" href="#search">Search trains</a>
          {currentUser?.role === 'ADMIN'
            ? <button className="nav-link nav-button" type="button" onClick={() => setAdminOpen(true)}>Admin workspace</button>
            : <button className="nav-link nav-button" type="button" onClick={openMyBookings}>My bookings</button>}
          <a className="nav-link" href="#help">Help</a>
        </nav>

        <div className="account-actions">
          {currentUser ? <>
            <span className="account-name">{currentUser.name.split(' ')[0]}</span>
            <button className="button button-quiet" type="button" onClick={logOut}>Sign out</button>
          </> : <>
            <button className="button button-quiet" type="button" onClick={() => setAuthMode('login')}>Sign in</button>
            <button className="button button-primary" type="button" onClick={() => setAuthMode('register')}>Create account</button>
          </>}
        </div>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow"><span className="eyebrow-dot" /> YOUR JOURNEY, SIMPLIFIED</span>
            <h1>Every journey<br />starts <span>here.</span></h1>
            <p>Find your train, choose your seat, and get moving. Your next journey is just a few clicks away.</p>
            <div className="hero-points">
              <span><span className="point-check">✓</span> Simple booking</span>
              <span><span className="point-check">✓</span> Clear fares</span>
              <span><span className="point-check">✓</span> Easy ticket access</span>
            </div>
          </div>
          <TrainHero />
        </section>

        <section className="booking-section" id="search">
          <div className="section-heading">
            <div>
              <span className="section-kicker">PLAN YOUR TRIP</span>
              <h2>Where would you like to go?</h2>
            </div>
            <span className="demo-tag">SEARCH DEMO</span>
          </div>

          <form className="search-card" onSubmit={searchJourneys}>
            <div className="field station-field">
              <label htmlFor="from">FROM STATION</label>
              <div className="input-with-icon">
                <span aria-hidden="true">↗</span>
                <input id="from" list="station-suggestions" value={from} onChange={(event) => setFrom(event.target.value)} placeholder="Station name or code" autoComplete="off" required />
              </div>
            </div>

            <button className="swap-button" type="button" onClick={swapStations} aria-label="Swap departure and arrival stations" title="Swap stations">⇄</button>

            <div className="field station-field">
              <label htmlFor="to">TO STATION</label>
              <div className="input-with-icon">
                <span aria-hidden="true">⌖</span>
                <input id="to" list="station-suggestions" value={to} onChange={(event) => setTo(event.target.value)} placeholder="Station name or code" autoComplete="off" required />
              </div>
            </div>

            <div className="field date-field">
              <label htmlFor="journey-date">JOURNEY DATE</label>
              <input id="journey-date" type="date" min={localToday} value={journeyDate} onChange={(event) => setJourneyDate(event.target.value)} required />
            </div>

            <div className="field class-field">
              <label htmlFor="travel-class">TRAVEL CLASS</label>
              <select id="travel-class" value={travelClass} onChange={(event) => setTravelClass(event.target.value)}>
                <option>All classes</option>
                <option>2S</option>
                <option>CC</option>
                <option>EC</option>
              </select>
            </div>

            <button className="button button-search" type="submit">
              Search trains <span aria-hidden="true">→</span>
            </button>
          </form>
          <datalist id="station-suggestions">
            {stations.map((station) => <option key={station.code} value={station.name} label={`${station.code} · ${station.city}`} />)}
          </datalist>
          <p className="form-note" role="status"><span aria-hidden="true">ⓘ</span>
            {apiAvailable === false
              ? 'Railway search is currently unavailable. The sample cards below are not search results.'
              : apiAvailable === true
                ? 'Search uses schedules, fares, and availability from the connected project database.'
                : 'Connecting to the project railway service…'}
          </p>
        </section>

        <section className="results-section" id="trains">
          <div className="results-heading">
            <div>
              <span className="section-kicker">{searched ? searchState === 'success' ? 'DATABASE RESULTS' : 'TRAIN SEARCH' : 'GETTING YOU THERE'}</span>
              <h2>{searched ? searchState === 'loading' ? 'Searching schedules' : searchState === 'success' ? 'Matching trains' : 'Search unavailable' : 'Popular train options'}</h2>
              <p>{searched
                ? searchState === 'loading' ? 'Checking the project schedule and availability database…'
                  : searchState === 'success' ? `Results for ${from} to ${to} on ${journeyDate}.`
                    : message || 'The project railway service could not return search results.'
                : 'Explore clearly labelled examples of how train options can appear.'}</p>
            </div>
            <span className="result-count">{searched ? searchState === 'success' ? `${visibleTrains.length} matches` : '' : 'Sample data'}</span>
          </div>

          <div className="train-list">
            {visibleTrains.map((train) => (
              <article className="train-card" key={train.id}>
                <div className="train-identity">
                  <div className="train-icon" aria-hidden="true">↗</div>
                  <div>
                    <h3>{train.name}</h3>
                    <p>#{train.number} <span className="mini-dot">·</span> Express</p>
                  </div>
                </div>

                <div className="train-timing">
                  <div className="time-point">
                    <strong>{train.departure}</strong>
                    <span>{train.from}</span>
                  </div>
                  <div className="journey-line">
                    <span>{train.duration}</span>
                    <div><i /><span /><i /></div>
                    <small>Direct journey</small>
                  </div>
                  <div className="time-point arrival">
                    <strong>{train.arrival}</strong>
                    <span>{train.to}</span>
                  </div>
                </div>

                <div className="train-fare">
                  <span>Starting from</span>
                  <strong>₹{Math.min(...Object.values(train.fares)).toLocaleString('en-IN')}</strong>
                  <small>{train.isDemo === false ? `${train.availableSeats} available` : 'Sample fare'}</small>
                </div>

                <div className="train-action">
                  <button className="button button-outline" type="button" onClick={() => selectTrain(train)}>View options <span aria-hidden="true">→</span></button>
                  <small>{train.classes.join(' · ')}</small>
                </div>
              </article>
            ))}
            {searchState === 'loading' && <div className="empty-state" role="status"><h3>Searching the project database…</h3></div>}
            {searched && searchState === 'success' && visibleTrains.length === 0 && (
              <div className="empty-state">
                <span aria-hidden="true">⌕</span>
                <h3>No matching trains found</h3>
                <p>Try a different route, journey date, or travel class.</p>
              </div>
            )}
            {searched && searchState === 'error' && (
              <div className="empty-state" role="alert">
                <h3>Train search could not be completed</h3>
                <p>{message || 'Check the connection and try again.'}</p>
              </div>
            )}
            {!searched && visibleTrains.length === 0 && (
              <div className="empty-state"><h3>No sample trains for this class</h3><p>Choose another class to see the demonstration cards.</p></div>
            )}
          </div>

          <p className="results-disclaimer">{searched && searchState === 'success'
            ? 'Results come from the project database and represent locally managed project schedules, not live railway operator inventory.'
            : 'Sample train names, times, fares, and station codes are illustrative only. They do not represent current railway schedules or availability.'}</p>
        </section>

        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button>
          </div>
        )}

        {accountOpen && currentUser?.role === 'PASSENGER' && (
          <section className="account-section" id="account" aria-labelledby="account-title">
            <div className="section-heading">
              <div><span className="section-kicker">PASSENGER ACCOUNT</span><h2 id="account-title">My bookings</h2></div>
              <button className="button button-quiet" type="button" onClick={() => setAccountOpen(false)}>Close</button>
            </div>
            <div className="pnr-search-panel">
              <form className="pnr-form" onSubmit={retrievePnr}>
                <label htmlFor="pnr-search">Retrieve a ticket by PNR</label>
                <div><input id="pnr-search" value={pnrInput} onChange={(event) => setPnrInput(event.target.value)} maxLength={10} placeholder="Enter 10-character PNR" required />
                  <button className="button button-outline" type="submit">Find booking</button></div>
              </form>
              <p>PNR access is restricted to the passenger account that owns the booking.</p>
            </div>
            {accountError && <p className="dialog-error" role="alert">{accountError}</p>}
            {cancellationQuote && <div className="cancel-confirm" role="alertdialog" aria-labelledby="cancel-title" aria-describedby="cancel-description">
              <div><strong id="cancel-title">Confirm cancellation</strong><p id="cancel-description">The configured project policy returns {cancellationQuote.refundPercent}% of the fare: <b>₹{cancellationQuote.refundAmount.toLocaleString('en-IN')}</b>. Cancellation releases the confirmed seats. This is a simulated refund.</p></div>
              <div className="cancel-actions"><button className="button button-quiet" type="button" onClick={() => setCancellationQuote(null)}>Keep booking</button><button className="button button-danger" type="button" disabled={cancellationBusy} onClick={confirmCancellation}>{cancellationBusy ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
            </div>}
            {retrievedBooking && <article className="booking-record ticket-record">
              <div className="booking-record-top"><strong>PNR {retrievedBooking.pnr}</strong><span className={retrievedBooking.status === 'CONFIRMED' ? 'status-confirmed' : 'status-cancelled'}>{retrievedBooking.status}</span></div>
              <h3>{retrievedBooking.trainName} · {retrievedBooking.trainNumber}</h3>
              <p>{retrievedBooking.originName} ({retrievedBooking.originCode}) → {retrievedBooking.destinationName} ({retrievedBooking.destinationCode}) · {retrievedBooking.journeyDate}</p>
              <p>{retrievedBooking.classType} · ₹{retrievedBooking.totalFare.toLocaleString('en-IN')}</p>
              <ul>{retrievedBooking.passengers.map((passenger) => <li key={passenger.passengerId}>{passenger.name}, age {passenger.age} · {passenger.coachNumber || 'Coach'} / {passenger.seatNumber || 'Seat released'}</li>)}</ul>
              {retrievedBooking.status === 'CONFIRMED' && <button className="button button-danger-outline" type="button" onClick={() => requestCancellation(retrievedBooking.pnr)}>Cancel booking</button>}
              <button className="button button-outline" type="button" onClick={() => window.print()}>Print ticket</button>
            </article>}
            <div className="booking-history-heading"><h3>Booking history</h3><button className="text-button" type="button" onClick={openMyBookings}>Refresh</button></div>
            {historyLoading && <p className="dialog-info" role="status">Loading your bookings…</p>}
            {!historyLoading && bookingHistory.length === 0 && <div className="empty-state"><h3>No bookings yet</h3><p>Confirmed bookings from this account will appear here.</p></div>}
            <div className="booking-history-list">{bookingHistory.map((booking) => <article className="booking-record" key={booking.bookingId}>
              <div className="booking-record-top"><strong>{booking.pnr || 'Payment attempt'}</strong><span className={booking.status === 'CONFIRMED' ? 'status-confirmed' : 'status-cancelled'}>{booking.status}</span></div>
              <h3>{booking.trainName} · {booking.trainNumber}</h3>
              <p>{booking.originCode} → {booking.destinationCode} · {booking.journeyDate}</p>
              <p>{booking.classType} · {booking.passengerCount} passenger{booking.passengerCount === 1 ? '' : 's'} · ₹{booking.totalFare.toLocaleString('en-IN')}</p>
              {booking.refundStatus && <p>Simulated refund: ₹{booking.refundAmount.toLocaleString('en-IN')} · {booking.refundStatus}</p>}
              {booking.pnr && <div className="booking-record-actions"><button className="button button-outline" type="button" onClick={() => viewTicket(booking.pnr)}>View ticket</button>{booking.status === 'CONFIRMED' && <button className="button button-danger-outline" type="button" onClick={() => requestCancellation(booking.pnr)}>Cancel</button>}</div>}
            </article>)}</div>
          </section>
        )}
        {adminOpen && currentUser?.role === 'ADMIN' && <AdminPanel onClose={() => setAdminOpen(false)} />}

        <section className="help-strip" id="help">
          <div className="help-icon" aria-hidden="true">?</div>
          <div>
            <strong>Need help planning your journey?</strong>
            <p>Schedules and account-based bookings are managed by the project service. Railway operator systems and real payment processing are not connected.</p>
          </div>
          <span className="help-arrow" aria-hidden="true">→</span>
        </section>
      </main>

      <footer className="footer">
        <a className="footer-brand" href="#home">Railway Reservation System</a>
        <span>Academic project · Simulated railway inventory</span>
      </footer>
      {authMode && <AuthDialog
        initialMode={authMode}
        onClose={() => { setAuthMode(null); setPendingTrain(null) }}
        onAuthenticated={(user) => {
          setCurrentUser(user)
          setAuthMode(null)
          setMessage(`Signed in as ${user.name}.`)
          if (pendingTrain && user.role === 'PASSENGER') setBookingTrain(pendingTrain)
          if (pendingTrain && user.role !== 'PASSENGER') setMessage('Passenger accounts are required to make bookings.')
          setPendingTrain(null)
        }}
      />}
      {bookingTrain && <BookingDialog
        train={bookingTrain}
        journeyDate={journeyDate}
        onClose={() => setBookingTrain(null)}
        onCompleted={(booking) => setMessage(`Booking confirmed. Your PNR is ${booking.pnr}.`)}
      />}
    </div>
  )
}

export default App
