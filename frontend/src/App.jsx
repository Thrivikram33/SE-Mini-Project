import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import SeatSelectionPage from './SeatSelectionPage'
import TrainSearchPage from './TrainSearchPage'
function HomePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow-xl">
        <div className="grid items-center gap-10 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:px-14 lg:py-16">
          <div>
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">
              Railway Reservation System
            </p>

            <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Your journey starts here.
            </h1>

            <p className="mt-6 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">
              Search train journeys, explore travel options, and manage your
              bookings in one convenient place.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/trains"
                className="rounded-xl bg-sky-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-sky-300"
              >
                Explore trains
              </Link>

              <Link
                to="/login"
                className="rounded-xl border border-slate-600 px-6 py-3 font-semibold text-white transition hover:bg-slate-800"
              >
                Sign in
              </Link>
            </div>
          </div>

          <div
            className="hidden min-h-64 items-center justify-center lg:flex"
            aria-hidden="true"
          >
            <div className="relative flex h-64 w-64 items-center justify-center rounded-full border border-sky-400/30 bg-sky-400/10">
              <div className="flex h-44 w-44 items-center justify-center rounded-full border border-sky-300/40 bg-sky-300/10">
                <svg
                  viewBox="0 0 120 120"
                  className="h-28 w-28 text-sky-300"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="26" y="17" width="68" height="77" rx="12" />
                  <path d="M36 28h48v29H36z" />
                  <path d="M37 70h46M43 94l-8 12m42-12 8 12" />
                  <circle cx="42" cy="83" r="4" />
                  <circle cx="78" cy="83" r="4" />
                  <path d="M15 108h90M20 116h80" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="mb-6">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Plan your next trip
          </h2>
          <p className="mt-2 text-slate-600">
            Your main travel tools will be available here as we build the
            system.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            number="01"
            title="Find trains"
            description="Explore routes, journey schedules, travel classes, and fares."
            link="/trains"
            linkLabel="Search trains"
          />

          <FeatureCard
            number="02"
            title="Manage bookings"
            description="View your tickets and access your booking history."
            link="/bookings"
            linkLabel="My bookings"
          />

          <FeatureCard
            number="03"
            title="Your account"
            description="Sign in or create an account to access passenger features."
            link="/login"
            linkLabel="Open account"
          />
        </div>
      </section>
    </main>
  )
}

function FeatureCard({ number, title, description, link, linkLabel }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <p className="text-sm font-bold tracking-widest text-sky-600">
        {number}
      </p>

      <h3 className="mt-4 text-xl font-semibold text-slate-900">{title}</h3>

      <p className="mt-3 min-h-12 leading-6 text-slate-600">{description}</p>

      <Link
        to={link}
        className="mt-5 inline-flex font-semibold text-sky-700 hover:text-sky-900"
      >
        {linkLabel} <span className="ml-2" aria-hidden="true">→</span>
      </Link>
    </article>
  )
}

function PlaceholderPage({ title, description }) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">
          Railway Reservation System
        </p>

        <h1 className="mt-3 text-3xl font-bold text-slate-900">{title}</h1>

        <p className="mt-4 leading-7 text-slate-600">{description}</p>

        <p className="mt-6 text-sm text-slate-500">
          This page is a navigation placeholder. Its functionality has not
          been implemented yet.
        </p>

        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}

function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <nav
          className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8"
          aria-label="Main navigation"
        >
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white">
              R
            </span>
            <span>
              <span className="block font-bold text-slate-900">
                RailReserve
              </span>
              <span className="block text-xs text-slate-500">
                Railway Reservation System
              </span>
            </span>
          </Link>

          <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-slate-600">
            <Link to="/" className="hover:text-sky-700">Home</Link>
            <Link to="/trains" className="hover:text-sky-700">Find trains</Link>
            <Link to="/bookings" className="hover:text-sky-700">My bookings</Link>
            <Link to="/seats" className="hover:text-sky-700">Select seats</Link>
            <Link
              to="/login"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-white hover:bg-slate-700"
            >
              Sign in
            </Link>
          </div>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/trains"
          element={<TrainSearchPage />}
        />
        <Route
          path="/bookings"
          element={
            <PlaceholderPage
              title="My bookings"
              description="Booking history and ticket retrieval will be connected after authentication and booking APIs are implemented."
            />
          }
        />
        <Route
          path="/login"
          element={
            <PlaceholderPage
              title="Passenger sign in"
              description="Registration, authentication, and role-based access will be implemented with the backend."
            />
          }
        />
        <Route path="/seats" element={<SeatSelectionPage />} />
        <Route
          path="*"
          element={
            <PlaceholderPage
              title="Page not found"
              description="The page you requested does not exist."
            />
          }
        />
      </Routes>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-6 text-sm text-slate-500 sm:px-6 lg:px-8">
          <p>Railway Reservation System</p>
          <p>Project prototype — booking functionality is not active yet.</p>
        </div>
      </footer>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}

export default App
