import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''
const CLASSES = ['1A', '2A', '3A', 'SL', 'CC', '2S']
const BERTHS = ['LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER', 'SEAT', 'NA']

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.message || 'The administrator request could not be completed.')
    error.status = response.status
    throw error
  }
  return result
}

function Field({ label, children }) {
  return <label className="block text-sm font-medium text-slate-700">{label}{children}</label>
}

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900'
const primaryButton = 'rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60'

export default function AdminManagementPage() {
  const navigate = useNavigate()
  const [stations, setStations] = useState([])
  const [trains, setTrains] = useState([])
  const [schedules, setSchedules] = useState([])
  const [selectedSchedule, setSelectedSchedule] = useState('')
  const [fares, setFares] = useState([])
  const [coaches, setCoaches] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [accessDenied, setAccessDenied] = useState(false)
  const [editingTrainId, setEditingTrainId] = useState('')
  const [editingScheduleId, setEditingScheduleId] = useState('')
  const [trainForm, setTrainForm] = useState({ trainNumber: '', trainName: '', active: true, routeText: '' })
  const [scheduleForm, setScheduleForm] = useState({ trainId: '', journeyDate: '', status: 'SCHEDULED' })
  const [fareForm, setFareForm] = useState({ classType: 'SL', amount: '', currency: 'INR' })
  const [coachForm, setCoachForm] = useState({ classType: 'SL', coachNumber: '', seatNumbers: '', berthType: 'NA' })
  const [seatEdits, setSeatEdits] = useState({})

  const refreshMasterData = useCallback(async () => {
    const [stationResult, trainResult, scheduleResult] = await Promise.all([
      apiRequest('/api/admin/stations'),
      apiRequest('/api/admin/trains'),
      apiRequest('/api/admin/schedules'),
    ])
    setStations(stationResult.stations || [])
    setTrains(trainResult.trains || [])
    setSchedules(scheduleResult.schedules || [])
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(refreshMasterData).catch((requestError) => {
      if (!active) return
      if (requestError.status === 401) {
        navigate(`/login?returnTo=${encodeURIComponent('/admin')}`, { replace: true })
      } else if (requestError.status === 403) {
        setAccessDenied(true)
      } else {
        setError(requestError.message)
      }
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate, refreshMasterData])

  const currentSchedule = useMemo(
    () => schedules.find((schedule) => String(schedule.scheduleId) === selectedSchedule),
    [schedules, selectedSchedule],
  )

  const loadScheduleDetails = useCallback(async (scheduleId) => {
    if (!scheduleId) {
      setFares([])
      setCoaches([])
      return
    }
    try {
      const [fareResult, inventoryResult] = await Promise.all([
        apiRequest(`/api/admin/schedules/${encodeURIComponent(scheduleId)}/fares`),
        apiRequest(`/api/admin/schedules/${encodeURIComponent(scheduleId)}/inventory`),
      ])
      setFares(fareResult.fares || [])
      setCoaches(inventoryResult.coaches || [])
      setSeatEdits({})
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(() => loadScheduleDetails(selectedSchedule))
  }, [loadScheduleDetails, selectedSchedule])

  async function mutate(path, method, body, successMessage) {
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await apiRequest(path, { method, body: JSON.stringify(body) })
      await refreshMasterData()
      if (selectedSchedule) await loadScheduleDetails(selectedSchedule)
      setSuccess(successMessage)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function editTrain(train) {
    setEditingTrainId(String(train.trainId))
    setTrainForm({
      trainNumber: train.trainNumber,
      trainName: train.trainName,
      active: train.active,
      routeText: routeTextFor(train),
    })
  }

  function routeTextFor(train) {
    return train.routeStops.map((stop) => [
      stop.stationCode,
      stop.arrivalTime || '',
      stop.departureTime || '',
      stop.dayOffset,
    ].join(',')).join('\n')
  }

  function parseRouteStops(routeText) {
    return routeText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [stationCode, arrivalTime = '', departureTime = '', dayOffset = '0'] = line.split(',').map((part) => part.trim())
      return { stationCode, arrivalTime: arrivalTime || null, departureTime: departureTime || null, dayOffset: Number(dayOffset) }
    })
  }

  async function submitTrain(event) {
    event.preventDefault()
    const body = {
      trainNumber: trainForm.trainNumber,
      trainName: trainForm.trainName,
      active: trainForm.active,
    }
    const existingTrain = trains.find((train) => String(train.trainId) === editingTrainId)
    if (!editingTrainId || !existingTrain || routeTextFor(existingTrain) !== trainForm.routeText) {
      body.routeStops = parseRouteStops(trainForm.routeText)
    }
    const path = editingTrainId ? `/api/admin/trains/${encodeURIComponent(editingTrainId)}` : '/api/admin/trains'
    const done = await mutate(path, editingTrainId ? 'PUT' : 'POST', body, editingTrainId ? 'Train details saved.' : 'Train and route created.')
    if (done) {
      setEditingTrainId('')
      setTrainForm({ trainNumber: '', trainName: '', active: true, routeText: '' })
    }
  }

  function editSchedule(schedule) {
    setEditingScheduleId(String(schedule.scheduleId))
    setSelectedSchedule(String(schedule.scheduleId))
    setScheduleForm({
      trainId: String(schedule.trainId),
      journeyDate: String(schedule.journeyDate).slice(0, 10),
      status: schedule.status,
    })
  }

  async function submitSchedule(event) {
    event.preventDefault()
    const path = editingScheduleId ? `/api/admin/schedules/${encodeURIComponent(editingScheduleId)}` : '/api/admin/schedules'
    const body = editingScheduleId
      ? { journeyDate: scheduleForm.journeyDate, status: scheduleForm.status }
      : { trainId: scheduleForm.trainId, journeyDate: scheduleForm.journeyDate }
    const done = await mutate(path, editingScheduleId ? 'PUT' : 'POST', body, editingScheduleId ? 'Schedule updated.' : 'Schedule created.')
    if (done) {
      setEditingScheduleId('')
      if (!editingScheduleId) setSelectedSchedule('')
      setScheduleForm({ trainId: '', journeyDate: '', status: 'SCHEDULED' })
    }
  }

  async function submitFare(event) {
    event.preventDefault()
    if (!selectedSchedule) return setError('Select a schedule before configuring a fare.')
    await mutate(`/api/admin/schedules/${encodeURIComponent(selectedSchedule)}/fares/${encodeURIComponent(fareForm.classType)}`, 'PUT', {
      amount: fareForm.amount,
      currency: fareForm.currency,
    }, 'Fare saved. Train search now uses the updated amount.')
  }

  async function submitCoach(event) {
    event.preventDefault()
    if (!selectedSchedule) return setError('Select a schedule before adding inventory.')
    const seatNumbers = coachForm.seatNumbers.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean)
    if (seatNumbers.length === 0) return setError('Enter at least one seat number.')
    await mutate(`/api/admin/schedules/${encodeURIComponent(selectedSchedule)}/coaches`, 'POST', {
      classType: coachForm.classType,
      coachNumber: coachForm.coachNumber,
      seats: seatNumbers.map((seatNumber) => ({ seatNumber, berthType: coachForm.berthType, status: 'AVAILABLE' })),
    }, 'Coach and seat inventory added.')
  }

  async function updateSeat(coachId, seat) {
    const edit = seatEdits[seat.seatId] || seat
    await mutate(`/api/admin/seats/${encodeURIComponent(seat.seatId)}`, 'PUT', {
      seatNumber: edit.seatNumber,
      berthType: edit.berthType,
      status: edit.status,
    }, 'Seat inventory updated.')
  }

  if (loading) return <main className="mx-auto max-w-6xl px-4 py-14"><p role="status">Loading administrator management…</p></main>
  if (accessDenied) return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <section className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Administrator access required</h1>
        <p className="mt-3 text-slate-600">Your account is not authorized to manage railway master data.</p>
        <Link to="/" className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white">Return home</Link>
      </section>
    </main>
  )

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 rounded-2xl bg-slate-900 p-6 text-white sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Administrator workspace</p>
        <h1 className="mt-2 text-3xl font-bold">Railway master data</h1>
        <p className="mt-2 max-w-3xl text-slate-300">Manage train routes, schedules, class fares, coaches and seat availability. Changes are audited and immediately feed passenger train search.</p>
      </header>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      {success && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{success}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">Trains and routes</h2>
          <p className="mt-1 text-sm text-slate-600">Route station codes must exist in the station catalog: {stations.map((station) => station.code).join(', ') || 'none configured'}. Route edits are disabled after a schedule is created; this protects existing trip data.</p>
          <form onSubmit={submitTrain} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Train number"><input required maxLength={10} value={trainForm.trainNumber} onChange={(event) => setTrainForm({ ...trainForm, trainNumber: event.target.value })} className={inputClass} /></Field>
              <Field label="Train name"><input required maxLength={150} value={trainForm.trainName} onChange={(event) => setTrainForm({ ...trainForm, trainName: event.target.value })} className={inputClass} /></Field>
            </div>
            <Field label="Ordered route stops"><textarea required rows={5} value={trainForm.routeText} onChange={(event) => setTrainForm({ ...trainForm, routeText: event.target.value })} placeholder={'BLR,,09:00,0\nMAS,17:30,,0'} className={`${inputClass} font-mono`} /><span className="mt-1 block text-xs text-slate-500">One per line: station code, arrival time, departure time, day offset. First stop needs departure; later stops need arrival.</span></Field>
            {editingTrainId && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={trainForm.active} onChange={(event) => setTrainForm({ ...trainForm, active: event.target.checked })} /> Train active in passenger search</label>}
            <div className="flex flex-wrap gap-3"><button disabled={busy} className={primaryButton}>{busy ? 'Saving…' : editingTrainId ? 'Save train' : 'Create train'}</button>{editingTrainId && <button type="button" onClick={() => { setEditingTrainId(''); setTrainForm({ trainNumber: '', trainName: '', active: true, routeText: '' }) }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Stop editing</button>}</div>
          </form>
          <div className="mt-6 space-y-3">
            {trains.map((train) => <article key={train.trainId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{train.trainNumber} · {train.trainName}</h3><p className="mt-1 text-xs text-slate-500">{train.active ? 'Active' : 'Deactivated'} · {train.routeStops.map((stop) => stop.stationCode).join(' → ') || 'No route configured'}</p></div><button type="button" onClick={() => editTrain(train)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Edit</button></div>
            </article>)}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-xl font-bold text-slate-900">Train schedules</h2>
          <form onSubmit={submitSchedule} className="mt-5 grid gap-4 sm:grid-cols-2">
            {!editingScheduleId && <Field label="Train"><select required value={scheduleForm.trainId} onChange={(event) => setScheduleForm({ ...scheduleForm, trainId: event.target.value })} className={inputClass}><option value="">Select train</option>{trains.filter((train) => train.active).map((train) => <option key={train.trainId} value={train.trainId}>{train.trainNumber} · {train.trainName}</option>)}</select></Field>}
            <Field label="Journey date"><input required type="date" value={scheduleForm.journeyDate} onChange={(event) => setScheduleForm({ ...scheduleForm, journeyDate: event.target.value })} className={inputClass} /></Field>
            {editingScheduleId && <Field label="Schedule status"><select value={scheduleForm.status} onChange={(event) => setScheduleForm({ ...scheduleForm, status: event.target.value })} className={inputClass}><option>SCHEDULED</option><option>CANCELLED</option><option>COMPLETED</option></select></Field>}
            <div className="flex items-end gap-3"><button disabled={busy} className={primaryButton}>{editingScheduleId ? 'Save schedule' : 'Create schedule'}</button>{editingScheduleId && <button type="button" onClick={() => { setEditingScheduleId(''); setScheduleForm({ trainId: '', journeyDate: '', status: 'SCHEDULED' }) }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancel</button>}</div>
          </form>
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-3">Train and date</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Inventory</th><th className="px-3 py-3">Actions</th></tr></thead>
              <tbody>{schedules.map((schedule) => <tr key={schedule.scheduleId} className={`border-t border-slate-100 ${selectedSchedule === String(schedule.scheduleId) ? 'bg-sky-50' : ''}`}><td className="px-3 py-3"><p className="font-semibold">{schedule.trainNumber} · {schedule.trainName}</p><p className="text-xs text-slate-500">{String(schedule.journeyDate).slice(0, 10)}</p></td><td className="px-3 py-3">{schedule.status}</td><td className="px-3 py-3">{schedule.coachCount} coaches · {schedule.seatCount} seats</td><td className="px-3 py-3"><div className="flex gap-2"><button type="button" onClick={() => editSchedule(schedule)} className="rounded border border-slate-300 px-2 py-1">Edit</button><button type="button" onClick={() => setSelectedSchedule(String(schedule.scheduleId))} className="rounded border border-slate-300 px-2 py-1">Configure</button></div></td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-900">Fares and seat inventory</h2><p className="mt-1 text-sm text-slate-600">Updates are stored on the selected schedule and are reflected in passenger search.</p></div><Field label="Selected schedule"><select value={selectedSchedule} onChange={(event) => setSelectedSchedule(event.target.value)} className={`${inputClass} min-w-64`}><option value="">Choose a schedule</option>{schedules.map((schedule) => <option key={schedule.scheduleId} value={schedule.scheduleId}>{schedule.trainNumber} · {String(schedule.journeyDate).slice(0, 10)} · {schedule.status}</option>)}</select></Field></div>
        {!currentSchedule && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Select or create a schedule to configure its class fares and seat inventory.</p>}
        {currentSchedule && <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <div>
            <h3 className="font-bold text-slate-900">Class fares</h3>
            <form onSubmit={submitFare} className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Class"><select value={fareForm.classType} onChange={(event) => setFareForm({ ...fareForm, classType: event.target.value })} className={inputClass}>{CLASSES.map((value) => <option key={value}>{value}</option>)}</select></Field>
              <Field label="Amount"><input required inputMode="decimal" value={fareForm.amount} onChange={(event) => setFareForm({ ...fareForm, amount: event.target.value })} className={inputClass} /></Field>
              <Field label="Currency"><input required maxLength={3} value={fareForm.currency} onChange={(event) => setFareForm({ ...fareForm, currency: event.target.value.toUpperCase() })} className={inputClass} /></Field>
              <button disabled={busy} className={primaryButton}>Save fare</button>
            </form>
            <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{fares.map((fare) => <li key={fare.fareId} className="flex justify-between px-4 py-3 text-sm"><span className="font-semibold">{fare.classType}</span><span>{fare.currency} {Number(fare.amount).toFixed(2)}</span><button type="button" onClick={() => setFareForm({ classType: fare.classType, amount: fare.amount, currency: fare.currency })} className="font-semibold text-sky-700">Edit</button></li>)}{fares.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No fares configured.</li>}</ul>
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Add coach and seats</h3>
            <form onSubmit={submitCoach} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Class"><select value={coachForm.classType} onChange={(event) => setCoachForm({ ...coachForm, classType: event.target.value })} className={inputClass}>{CLASSES.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Coach number"><input required maxLength={10} value={coachForm.coachNumber} onChange={(event) => setCoachForm({ ...coachForm, coachNumber: event.target.value })} className={inputClass} /></Field></div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="Seat numbers"><input required value={coachForm.seatNumbers} onChange={(event) => setCoachForm({ ...coachForm, seatNumbers: event.target.value })} placeholder="01, 02, 03" className={inputClass} /></Field><Field label="Berth type"><select value={coachForm.berthType} onChange={(event) => setCoachForm({ ...coachForm, berthType: event.target.value })} className={inputClass}>{BERTHS.map((value) => <option key={value}>{value}</option>)}</select></Field></div>
              <button disabled={busy} className={primaryButton}>Add inventory</button>
            </form>
          </div>
        </div>}
        {currentSchedule && <div className="mt-7 space-y-4">{coaches.map((coach) => <article key={coach.coachId} className="overflow-hidden rounded-xl border border-slate-200"><header className="flex justify-between bg-slate-50 px-4 py-3 text-sm"><strong>{coach.coachNumber} · {coach.classType}</strong><span>{coach.seats.length} seats</span></header><div className="divide-y divide-slate-100">{coach.seats.map((seat) => <div key={seat.seatId} className="grid items-center gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_1fr_auto]"><label className="text-xs font-semibold text-slate-500">Seat<input aria-label={`${coach.coachNumber} seat number`} value={seatEdits[seat.seatId]?.seatNumber ?? seat.seatNumber} onChange={(event) => setSeatEdits({ ...seatEdits, [seat.seatId]: { ...seat, ...seatEdits[seat.seatId], seatNumber: event.target.value } })} className={inputClass} /></label><label className="text-xs font-semibold text-slate-500">Berth<select aria-label={`${coach.coachNumber} berth type`} value={seatEdits[seat.seatId]?.berthType ?? seat.berthType} onChange={(event) => setSeatEdits({ ...seatEdits, [seat.seatId]: { ...seat, ...seatEdits[seat.seatId], berthType: event.target.value } })} className={inputClass}>{BERTHS.map((value) => <option key={value}>{value}</option>)}</select></label><label className="text-xs font-semibold text-slate-500">Inventory status<select aria-label={`${coach.coachNumber} inventory status`} value={seatEdits[seat.seatId]?.status ?? seat.status} disabled={seat.allocated} onChange={(event) => setSeatEdits({ ...seatEdits, [seat.seatId]: { ...seat, ...seatEdits[seat.seatId], status: event.target.value } })} className={inputClass}><option>AVAILABLE</option><option>BLOCKED</option></select>{seat.allocated && <span className="mt-1 block text-amber-700">Active booking protects this seat</span>}</label><button type="button" disabled={busy || seat.allocated} onClick={() => updateSeat(coach.coachId, seat)} className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Save seat</button></div>)}</div></article>)}</div>}
      </section>
    </main>
  )
}
