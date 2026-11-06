import { useLocation, useNavigate } from 'react-router-dom'

const CLASS_NAMES = {
  '1A': 'First AC',
  '2A': 'Second AC',
  '3A': 'Third AC',
  SL: 'Sleeper',
  CC: 'Chair Car',
  '2S': 'Second Sitting',
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-900">{children || '?'}</dd>
    </div>
  )
}

export default function BookingTicketPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const booking = state?.booking

  if (!booking || booking.status !== 'CONFIRMED' || !booking.pnr) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Ticket details unavailable</h1>
          <p className="mt-3 text-slate-600">
            Open this page immediately after a successful booking. For retrieving an existing ticket,
            use the booking retrieval feature when it is available.
          </p>
          <button onClick={() => navigate('/trains')} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">
            Search trains
          </button>
        </section>
      </main>
    )
  }

  const money = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(booking.totalFare))

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">RRS - Booking confirmation</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Your ticket is confirmed</h1>
        </div>
        <button onClick={() => window.print()} className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700">
          Print / Save as PDF
        </button>
      </div>

      <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg print:rounded-none print:border print:shadow-none">
        <header className="bg-slate-900 px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">RailReserve - E-Ticket</p>
              <h2 className="mt-2 text-2xl font-bold">Booking confirmed</h2>
              <p className="mt-1 text-sm text-slate-300">Your simulated payment was successful.</p>
            </div>
            <span className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-bold text-emerald-300">
              {booking.status}
            </span>
          </div>
          <div className="mt-6 border-t border-slate-700 pt-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Booking reference - PNR</p>
            <p className="mt-1 break-all text-3xl font-extrabold tracking-widest text-white">{booking.pnr}</p>
          </div>
        </header>

        <section className="p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <Detail label="Train number">{booking.trainNumber}</Detail>
            <Detail label="Train name">{booking.trainName}</Detail>
            <Detail label="Journey date">{booking.journeyDate}</Detail>
            <Detail label="Travel class">{booking.classType} - {CLASS_NAMES[booking.classType] || booking.classType}</Detail>
          </div>

          <div className="my-7 rounded-2xl bg-slate-50 p-5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">From</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{booking.origin?.code || '?'}</p>
                <p className="mt-1 text-sm text-slate-600">{booking.origin?.name || '?'}</p>
              </div>
              <span aria-hidden="true" className="text-2xl text-sky-600">&rarr;</span>
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">To</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{booking.destination?.code || '?'}</p>
                <p className="mt-1 text-sm text-slate-600">{booking.destination?.name || '?'}</p>
              </div>
            </div>
          </div>

          <section>
            <h3 className="text-lg font-bold text-slate-900">Passenger and seat details</h3>
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Passenger</th>
                    <th className="px-4 py-3">Age</th>
                    <th className="px-4 py-3">Gender</th>
                    <th className="px-4 py-3">Seat</th>
                  </tr>
                </thead>
                <tbody>
                  {booking.passengers?.map((passenger, index) => (
                    <tr key={index} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold text-slate-900">{passenger.name}</td>
                      <td className="px-4 py-3 text-slate-700">{passenger.age}</td>
                      <td className="px-4 py-3 text-slate-700">{passenger.gender}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{passenger.seatNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-dashed border-slate-300 pt-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total fare</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{booking.currency || 'INR'} {money}</p>
            </div>
            <p className="text-sm font-semibold text-emerald-700">Payment status: SUCCESS</p>
          </section>
        </section>
        <footer className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-center text-xs text-slate-500">
          This ticket confirms a booking in the Railway Reservation System project.
          Payment is simulated; this is not a live railway reservation.
        </footer>
      </article>

      <div className="mt-6 flex flex-wrap gap-3 print:hidden">
        <button onClick={() => navigate('/trains')} className="rounded-xl bg-sky-500 px-5 py-3 font-semibold text-slate-950 hover:bg-sky-400">
          Book another journey
        </button>
        <button onClick={() => navigate('/')} className="rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-700 hover:bg-slate-50">
          Home
        </button>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          main { max-width: 100% !important; padding: 0 !important; }
        }
      `}</style>
    </main>
  )
}
