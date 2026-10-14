import { useEffect, useRef, useState } from 'react'
import { createBooking, getAvailability } from '../api/client.js'

const newPassenger = () => ({ name: '', age: '', gender: 'UNSPECIFIED' })

export default function BookingDialog({ train, journeyDate, onClose, onCompleted }) {
  const dialogRef = useRef(null)
  const [availability, setAvailability] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [passengers, setPassengers] = useState([newPassenger()])
  const [selectedSeats, setSelectedSeats] = useState([])
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [ticket, setTicket] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  useEffect(() => {
    let active = true
    getAvailability(train.scheduleId)
      .then((data) => { if (active) setAvailability(data) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [train.scheduleId])

  const travelClass = availability?.classes.find((item) => item.classType === train.classType)
  const totalFare = travelClass ? travelClass.fare * passengers.length : 0

  function updatePassenger(index, field, value) {
    setPassengers((current) => current.map((passenger, i) => i === index ? { ...passenger, [field]: value } : passenger))
  }

  function toggleSeat(seatId) {
    setSelectedSeats((current) => current.includes(seatId)
      ? current.filter((id) => id !== seatId)
      : current.length < passengers.length ? [...current, seatId] : current)
    setError('')
  }

  function addPassenger() {
    if (passengers.length < 6) setPassengers((current) => [...current, newPassenger()])
  }

  function removePassenger(index) {
    setPassengers((current) => current.filter((_, i) => i !== index))
    setSelectedSeats((current) => current.slice(0, Math.max(0, passengers.length - 1)))
  }

  async function submit(event) {
    event.preventDefault()
    if (selectedSeats.length !== passengers.length) {
      setError('Select one available seat for each passenger.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await createBooking({
        scheduleId: train.scheduleId,
        source: train.from,
        destination: train.to,
        classType: train.classType,
        passengers: passengers.map((passenger) => ({ ...passenger, age: Number(passenger.age) })),
        seatIds: selectedSeats,
        ...(import.meta.env.DEV && simulateFailure ? { paymentOutcome: 'failure' } : {}),
      })
      setTicket(result)
      onCompleted(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog className="booking-dialog" ref={dialogRef} aria-labelledby="booking-title" onCancel={(event) => { event.preventDefault(); onClose() }}>
      <div className="dialog-heading">
        <div>
          <span className="section-kicker">{ticket ? 'BOOKING CONFIRMED' : 'BOOK YOUR JOURNEY'}</span>
          <h2 id="booking-title">{ticket ? 'Your ticket' : train.name}</h2>
          <p className="dialog-subtitle">{ticket ? `PNR ${ticket.pnr}` : `${train.from} to ${train.to} · ${journeyDate} · ${train.classType}`}</p>
        </div>
        <button className="dialog-close" type="button" onClick={onClose} aria-label="Close booking dialog">×</button>
      </div>

      {ticket ? (
        <div className="ticket-panel">
          <div className="ticket-pnr"><span>PNR</span><strong>{ticket.pnr}</strong><span className="status-confirmed">CONFIRMED</span></div>
          <p>{ticket.trainName} ({ticket.trainNumber})</p>
          <p>{ticket.originName} ({ticket.originCode}) → {ticket.destinationName} ({ticket.destinationCode})</p>
          <p>{ticket.journeyDate} · {ticket.classType} · ₹{ticket.totalFare.toLocaleString('en-IN')}</p>
          <ul>{ticket.passengers.map((passenger, index) => <li key={`${passenger.name}-${index}`}>{passenger.name} · Coach/seat {passenger.seatNumber}</li>)}</ul>
          <p className="form-note">Simulated payment only. No real payment was made.</p>
          <button className="button button-outline" type="button" onClick={() => window.print()}>Print / save ticket</button>
        </div>
      ) : (
        <>
          {loading && <p className="dialog-info" role="status">Checking current seat availability…</p>}
          {!loading && availability && (
            <form className="booking-form" onSubmit={submit}>
              <fieldset className="seat-picker">
                <legend>Choose seats <span>({selectedSeats.length} of {passengers.length} selected)</span></legend>
                {!travelClass && <p className="dialog-error">This travel class is no longer available for this schedule.</p>}
                <div className="seat-grid">
                  {travelClass?.seats.map((seat) => {
                    const selected = selectedSeats.includes(seat.seatId)
                    const available = seat.status === 'AVAILABLE'
                    return <button key={seat.seatId} className={`seat-option${selected ? ' selected' : ''}`} type="button" disabled={!available || (!selected && selectedSeats.length >= passengers.length)} aria-pressed={selected} onClick={() => toggleSeat(seat.seatId)}>
                      <strong>{seat.seatNumber}</strong><small>{available ? selected ? 'Selected' : 'Available' : 'Booked'}</small>
                    </button>
                  })}
                </div>
              </fieldset>
              <div className="passenger-heading"><strong>Passenger details</strong><button className="text-button" type="button" onClick={addPassenger} disabled={passengers.length >= 6}>+ Add passenger</button></div>
              {passengers.map((passenger, index) => <fieldset className="passenger-fields" key={index}>
                <legend>Passenger {index + 1}{passengers.length > 1 && <button className="text-button remove-passenger" type="button" onClick={() => removePassenger(index)}>Remove</button>}</legend>
                <label>Full name<input value={passenger.name} onChange={(event) => updatePassenger(index, 'name', event.target.value)} required minLength={2} maxLength={120} /></label>
                <div className="passenger-row">
                  <label>Age<input type="number" min="0" max="120" value={passenger.age} onChange={(event) => updatePassenger(index, 'age', event.target.value)} required /></label>
                  <label>Gender<select value={passenger.gender} onChange={(event) => updatePassenger(index, 'gender', event.target.value)}><option value="UNSPECIFIED">Prefer not to say</option><option value="F">Female</option><option value="M">Male</option><option value="X">Other</option></select></label>
                </div>
              </fieldset>)}
              <div className="fare-summary"><span>Fare · {passengers.length} passenger{passengers.length === 1 ? '' : 's'}</span><strong>₹{totalFare.toLocaleString('en-IN')}</strong></div>
              <p className="dialog-info">Payment is simulated. Do not enter card or bank details.</p>
              {import.meta.env.DEV && <label className="simulator-toggle"><input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} /> Simulate payment failure (development test)</label>}
              {error && <p className="dialog-error" role="alert">{error}</p>}
              <button className="button button-search dialog-submit" type="submit" disabled={busy || loading || !travelClass}>{busy ? 'Processing simulated payment…' : 'Confirm and pay (simulation)'}</button>
            </form>
          )}
          {!loading && !availability && error && <p className="dialog-error" role="alert">{error}</p>}
        </>
      )}
    </dialog>
  )
}
