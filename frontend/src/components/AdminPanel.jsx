import { useEffect, useState } from 'react'
import {
  cancelAdminBooking,
  createAdminSchedule,
  createAdminTrain,
  getAdminAudit,
  getAdminBookings,
  getAdminCancellationQuote,
  getAdminRoute,
  getAdminSchedules,
  getAdminTrains,
  updateAdminRoute,
  updateAdminSchedule,
  updateAdminTrain,
} from '../api/client.js'

const initialSchedule = { trainId: '', journeyDate: '', classType: 'CC', fare: '', coachNumber: 'D1', seatNumbers: '' }

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState('trains')
  const [trains, setTrains] = useState([])
  const [schedules, setSchedules] = useState([])
  const [bookings, setBookings] = useState([])
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [trainForm, setTrainForm] = useState({ trainNumber: '', trainName: '' })
  const [scheduleForm, setScheduleForm] = useState(initialSchedule)
  const [routeTrain, setRouteTrain] = useState(null)
  const [routeText, setRouteText] = useState('')
  const [editSchedule, setEditSchedule] = useState(null)
  const [cancelQuote, setCancelQuote] = useState(null)

  async function load({ announceLoading = true } = {}) {
    if (announceLoading) {
      setLoading(true)
      setError('')
    }
    try {
      const [nextTrains, nextSchedules, nextBookings, nextAudit] = await Promise.all([
        getAdminTrains(), getAdminSchedules(), getAdminBookings(), getAdminAudit(),
      ])
      setTrains(nextTrains)
      setSchedules(nextSchedules)
      setBookings(nextBookings)
      setAudit(nextAudit)
    } catch (requestError) {
      setError(requestError.message)
    } finally { setLoading(false) }
  }

  useEffect(() => {
    let active = true
    Promise.all([getAdminTrains(), getAdminSchedules(), getAdminBookings(), getAdminAudit()])
      .then(([nextTrains, nextSchedules, nextBookings, nextAudit]) => {
        if (!active) return
        setTrains(nextTrains)
        setSchedules(nextSchedules)
        setBookings(nextBookings)
        setAudit(nextAudit)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function handleTabKeyDown(event, index) {
    const tabs = ['trains', 'schedules', 'bookings', 'audit']
    let nextIndex
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return
    event.preventDefault()
    setTab(tabs[nextIndex])
    document.getElementById(`admin-tab-${tabs[nextIndex]}`)?.focus()
  }

  async function act(action, successMessage) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally { setBusy(false) }
  }

  async function saveTrain(event) {
    event.preventDefault()
    await act(async () => {
      await createAdminTrain(trainForm)
      setTrainForm({ trainNumber: '', trainName: '' })
    }, 'Train created.')
  }

  async function openRoute(train) {
    setRouteTrain(train)
    setError('')
    try {
      const stops = await getAdminRoute(train.trainId)
      setRouteText(stops.map((stop) => `${stop.stationCode},${stop.arrivalTime?.slice(0, 5) || ''},${stop.departureTime?.slice(0, 5) || ''}`).join('\n'))
    } catch (requestError) { setError(requestError.message) }
  }

  async function saveRoute(event) {
    event.preventDefault()
    const stops = routeText.split('\n').map((line) => {
      const [stationCode, arrivalTime, departureTime] = line.split(',').map((part) => part.trim())
      return { stationCode, arrivalTime: arrivalTime || null, departureTime: departureTime || null }
    })
    await act(async () => {
      await updateAdminRoute(routeTrain.trainId, { stops })
      setRouteTrain(null)
    }, 'Train route saved.')
  }

  async function saveSchedule(event) {
    event.preventDefault()
    const seats = scheduleForm.seatNumbers.split(',').map((number) => number.trim()).filter(Boolean)
    await act(async () => {
      await createAdminSchedule({
        trainId: Number(scheduleForm.trainId),
        journeyDate: scheduleForm.journeyDate,
        classes: [{ classType: scheduleForm.classType, fare: Number(scheduleForm.fare) }],
        inventory: [{ classType: scheduleForm.classType, coachNumber: scheduleForm.coachNumber, seats: seats.map((seatNumber) => ({ seatNumber })) }],
      })
      setScheduleForm(initialSchedule)
    }, 'Schedule, fare, and initial inventory saved.')
  }

  async function saveScheduleChanges(event) {
    event.preventDefault()
    const seats = editSchedule.seatNumbers.split(',').map((number) => number.trim()).filter(Boolean)
    await act(async () => {
      const values = { status: editSchedule.status, classes: [{ classType: editSchedule.classType, fare: Number(editSchedule.fare) }] }
      if (seats.length) values.inventory = { coaches: [{ classType: editSchedule.classType, coachNumber: editSchedule.coachNumber, seats: seats.map((seatNumber) => ({ seatNumber })) }] }
      await updateAdminSchedule(editSchedule.scheduleId, values)
      setEditSchedule(null)
    }, 'Schedule changes saved.')
  }

  async function beginCancellation(pnr) {
    setError('')
    try { setCancelQuote(await getAdminCancellationQuote(pnr)) } catch (requestError) { setError(requestError.message) }
  }

  async function finishCancellation() {
    if (!cancelQuote) return
    const pnr = cancelQuote.pnr
    await act(async () => {
      await cancelAdminBooking(pnr)
      setCancelQuote(null)
    }, `Booking ${pnr} cancelled.`)
  }

  return (
    <section className="admin-panel" id="admin" aria-labelledby="admin-title">
      <div className="section-heading">
        <div><span className="section-kicker">AUTHORIZED ADMIN</span><h2 id="admin-title">Operations workspace</h2></div>
        <button className="button button-quiet" type="button" onClick={onClose}>Close</button>
      </div>
      <div className="admin-tabs" role="tablist" aria-label="Administration sections">
        {['trains', 'schedules', 'bookings', 'audit'].map((item, index) => <button key={item} id={`admin-tab-${item}`} role="tab" aria-controls="admin-tabpanel" aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} className={tab === item ? 'selected' : ''} type="button" onKeyDown={(event) => handleTabKeyDown(event, index)} onClick={() => setTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
      {error && <p className="dialog-error" role="alert">{error}</p>}
      {notice && <p className="dialog-success" role="status">{notice}</p>}
      <div role="tabpanel" id="admin-tabpanel" aria-labelledby={`admin-tab-${tab}`} tabIndex={0}>
      {loading ? <p className="dialog-info" role="status">Loading administrator data…</p> : <>
        {tab === 'trains' && <>
          <form className="admin-form" onSubmit={saveTrain}>
            <h3>Add train</h3>
            <label>Train number<input value={trainForm.trainNumber} onChange={(event) => setTrainForm({ ...trainForm, trainNumber: event.target.value })} required maxLength={12} /></label>
            <label>Train name<input value={trainForm.trainName} onChange={(event) => setTrainForm({ ...trainForm, trainName: event.target.value })} required minLength={2} maxLength={160} /></label>
            <button className="button button-search" type="submit" disabled={busy}>Create train</button>
          </form>
          <div className="admin-record-list">{trains.map((train) => <article className="admin-record" key={train.trainId}>
            <div><strong>{train.trainName}</strong><small>{train.trainNumber} · {train.active ? 'Active' : 'Inactive'}</small></div>
            <div className="admin-record-actions"><button className="button button-outline" type="button" onClick={() => openRoute(train)}>Edit route</button><button className="button button-outline" type="button" disabled={busy} onClick={() => act(() => updateAdminTrain(train.trainId, { active: !train.active }), train.active ? 'Train deactivated.' : 'Train activated.')}>{train.active ? 'Deactivate' : 'Activate'}</button></div>
          </article>)}</div>
          {routeTrain && <form className="admin-form route-editor" onSubmit={saveRoute}>
            <h3>Route · {routeTrain.trainName}</h3>
            <p>One stop per line: station code, arrival time, departure time. Use 24-hour time.</p>
            <label>Ordered stops<textarea value={routeText} onChange={(event) => setRouteText(event.target.value)} rows={5} placeholder={'DMB,,08:00\nDMC,13:30,'} required /></label>
            <div className="admin-record-actions"><button className="button button-search" type="submit" disabled={busy}>Save route</button><button className="button button-quiet" type="button" onClick={() => setRouteTrain(null)}>Close</button></div>
          </form>}
        </>}
        {tab === 'schedules' && <>
          <form className="admin-form" onSubmit={saveSchedule}>
            <h3>Create schedule</h3>
            <p>Configure the train route first. Schedule dates, fares, and inventory are stored in the project database.</p>
            <label>Train<select value={scheduleForm.trainId} onChange={(event) => setScheduleForm({ ...scheduleForm, trainId: event.target.value })} required><option value="">Choose a train</option>{trains.filter((train) => train.active).map((train) => <option key={train.trainId} value={train.trainId}>{train.trainNumber} · {train.trainName}</option>)}</select></label>
            <label>Journey date<input type="date" min={new Date().toISOString().slice(0, 10)} value={scheduleForm.journeyDate} onChange={(event) => setScheduleForm({ ...scheduleForm, journeyDate: event.target.value })} required /></label>
            <div className="admin-form-row"><label>Class<input value={scheduleForm.classType} onChange={(event) => setScheduleForm({ ...scheduleForm, classType: event.target.value.toUpperCase() })} required maxLength={12} /></label><label>Fare (INR)<input type="number" min="0" step="0.01" value={scheduleForm.fare} onChange={(event) => setScheduleForm({ ...scheduleForm, fare: event.target.value })} required /></label></div>
            <div className="admin-form-row"><label>Coach number<input value={scheduleForm.coachNumber} onChange={(event) => setScheduleForm({ ...scheduleForm, coachNumber: event.target.value.toUpperCase() })} required maxLength={12} /></label><label>Seat numbers (comma separated)<input value={scheduleForm.seatNumbers} onChange={(event) => setScheduleForm({ ...scheduleForm, seatNumbers: event.target.value })} placeholder="1A, 1B, 2A" required /></label></div>
            <button className="button button-search" type="submit" disabled={busy}>Create schedule</button>
          </form>
          <div className="admin-record-list">{schedules.map((schedule) => <article className="admin-record admin-schedule" key={`${schedule.scheduleId}-${schedule.classType}`}>
            <div><strong>{schedule.trainName} · {schedule.trainNumber}</strong><small>{schedule.journeyDate} · {schedule.classType || 'No class'} · {schedule.status} · {schedule.availableSeats} available · {schedule.fare === null ? 'No fare' : `₹${schedule.fare}`}</small></div>
            <button className="button button-outline" type="button" onClick={() => setEditSchedule({ scheduleId: schedule.scheduleId, status: schedule.status, classType: schedule.classType || 'CC', fare: schedule.fare ?? '', coachNumber: 'D1', seatNumbers: '' })}>Edit</button>
          </article>)}</div>
          {editSchedule && <form className="admin-form route-editor" onSubmit={saveScheduleChanges}>
            <h3>Edit schedule {editSchedule.scheduleId}</h3>
            <label>Status<select value={editSchedule.status} onChange={(event) => setEditSchedule({ ...editSchedule, status: event.target.value })}><option>SCHEDULED</option><option>CANCELLED</option><option>INACTIVE</option></select></label>
            <div className="admin-form-row"><label>Class<input value={editSchedule.classType} onChange={(event) => setEditSchedule({ ...editSchedule, classType: event.target.value.toUpperCase() })} required maxLength={12} /></label><label>Fare (INR)<input type="number" min="0" step="0.01" value={editSchedule.fare} onChange={(event) => setEditSchedule({ ...editSchedule, fare: event.target.value })} required /></label></div>
            <div className="admin-form-row"><label>Coach number<input value={editSchedule.coachNumber} onChange={(event) => setEditSchedule({ ...editSchedule, coachNumber: event.target.value.toUpperCase() })} /></label><label>Add/update seat numbers<input value={editSchedule.seatNumbers} onChange={(event) => setEditSchedule({ ...editSchedule, seatNumbers: event.target.value })} placeholder="1A, 1B, 2A" /></label></div>
            <div className="admin-record-actions"><button className="button button-search" type="submit" disabled={busy}>Save changes</button><button className="button button-quiet" type="button" onClick={() => setEditSchedule(null)}>Close</button></div>
          </form>}
        </>}
        {tab === 'bookings' && <div className="admin-record-list">{bookings.map((booking) => <article className="admin-record" key={booking.bookingId}>
          <div><strong>{booking.pnr || 'Payment attempt'} · {booking.status}</strong><small>{booking.trainNumber} · {booking.originCode} → {booking.destinationCode} · {booking.journeyDate} · {booking.userName} ({booking.email})</small></div>
          {booking.status === 'CONFIRMED' && booking.pnr && <button className="button button-danger-outline" type="button" onClick={() => beginCancellation(booking.pnr)}>Cancel</button>}
        </article>)}{!bookings.length && <div className="empty-state">No reservation records are available.</div>}</div>}
        {tab === 'audit' && <div className="admin-record-list">{audit.map((item) => <article className="admin-record" key={item.auditId}><div><strong>{item.action} · {item.entityType} {item.entityId}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''} · {item.actorName || 'System'}</small></div></article>)}{!audit.length && <div className="empty-state">No audit events are available.</div>}</div>}
      </>}
      </div>
      {cancelQuote && <div className="cancel-confirm" role="alertdialog" aria-labelledby="admin-cancel-title"><div><strong id="admin-cancel-title">Confirm booking cancellation</strong><p>Configured refund: {cancelQuote.refundPercent}% (₹{cancelQuote.refundAmount.toLocaleString('en-IN')}). This cancellation releases the seats.</p></div><div className="cancel-actions"><button className="button button-quiet" type="button" onClick={() => setCancelQuote(null)}>Keep booking</button><button className="button button-danger" type="button" disabled={busy} onClick={finishCancellation}>Confirm cancellation</button></div></div>}
    </section>
  )
}
