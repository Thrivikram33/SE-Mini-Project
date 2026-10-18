
import { useState } from "react";

export default function App() {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    mobile: "",
    password: "",
  });

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:5000/api/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const details = data.errors
          ?.map((error) => error.msg)
          .join(" ");

        throw new Error(details || data.message || "Registration failed.");
      }

      setMessage(data.message);
      setForm({
        full_name: "",
        email: "",
        mobile: "",
        password: "",
      });
    } catch (error) {
      setMessage(
        error.message === "Failed to fetch"
          ? "Cannot connect to the server. Please try again."
          : error.message
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-2xl text-white">
            🚆
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Create Account
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Register as a railway passenger
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="full_name" className="mb-1 block text-sm font-medium">
              Full name
            </label>
            <input
              id="full_name"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              placeholder="Enter your full name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="mobile" className="mb-1 block text-sm font-medium">
              Mobile number
            </label>
            <input
              id="mobile"
              name="mobile"
              type="tel"
              value={form.mobile}
              onChange={handleChange}
              required
              minLength={10}
              maxLength={15}
              pattern="[0-9]{10,15}"
              autoComplete="tel"
              className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              placeholder="10–15 digits"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        {message && (
          <p
            role="status"
            aria-live="polite"
            className="mt-5 rounded-lg bg-slate-100 p-3 text-sm text-slate-700"
          >
            {message}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-slate-500">
          Railway Reservation System
        </p>
      </section>
    </main>
  );
}
