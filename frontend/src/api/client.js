const configuredBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api'
const API_BASE = configuredBase.replace(/\/$/, '')

export class ApiClientError extends Error {
  constructor(message, code = 'API_ERROR', status = 0, details) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.details = details
  }
}

async function request(path, options) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
        ...options?.headers,
      },
    })
  } catch {
    throw new ApiClientError('The railway service is unavailable. Check that the API is running and try again.', 'NETWORK_ERROR')
  }

  if (response.status === 204) return { data: null }
  let body
  try { body = await response.json() } catch {
    throw new ApiClientError('The railway service returned an unreadable response.', 'INVALID_RESPONSE', response.status)
  }
  if (!response.ok) {
    throw new ApiClientError(body?.error?.message || 'The request could not be completed.', body?.error?.code, response.status, body?.error?.details)
  }
  if (!body || !Object.hasOwn(body, 'data') && path !== '/health' && path !== '/health/live') {
    throw new ApiClientError('The railway service returned an invalid response.', 'INVALID_RESPONSE', response.status)
  }
  return body
}

export async function getStations() {
  const body = await request('/stations')
  if (!Array.isArray(body.data)) throw new ApiClientError('The railway service returned invalid station data.', 'INVALID_RESPONSE')
  return body.data
}

export async function searchTrains({ source, destination, date, classType }) {
  const params = new URLSearchParams({ source, destination, date })
  if (classType) params.set('class', classType)
  const body = await request(`/trains/search?${params.toString()}`)
  if (!Array.isArray(body.data)) throw new ApiClientError('The railway service returned invalid train data.', 'INVALID_RESPONSE')
  return body.data
}

export async function registerAccount(values) {
  const body = await request('/auth/register', { method: 'POST', body: JSON.stringify(values) })
  return body.data
}

export async function signIn(values) {
  const body = await request('/auth/login', { method: 'POST', body: JSON.stringify(values) })
  return body.data
}

export async function signOut() {
  await request('/auth/logout', { method: 'POST' })
}

export async function getCurrentUser() {
  const body = await request('/auth/me')
  return body.data
}

export async function getAvailability(scheduleId) {
  const body = await request(`/trains/${encodeURIComponent(scheduleId)}/availability`)
  return body.data
}

export async function createBooking(values) {
  const body = await request('/bookings', { method: 'POST', body: JSON.stringify(values) })
  return body.data
}

export async function getMyBookings() {
  const body = await request('/bookings')
  return body.data
}

export async function getBooking(pnr) {
  const body = await request(`/bookings/${encodeURIComponent(pnr)}`)
  return body.data
}

export async function getCancellationQuote(pnr) {
  const body = await request(`/bookings/${encodeURIComponent(pnr)}/cancellation-quote`)
  return body.data
}

export async function cancelBooking(pnr) {
  const body = await request(`/bookings/${encodeURIComponent(pnr)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ confirm: true }),
  })
  return body.data
}

async function adminRequest(path, method = 'GET', values) {
  const body = await request(`/admin${path}`, {
    method,
    ...(values === undefined ? {} : { body: JSON.stringify(values) }),
  })
  return body.data
}

export const getAdminTrains = () => adminRequest('/trains')
export const createAdminTrain = (values) => adminRequest('/trains', 'POST', values)
export const updateAdminTrain = (id, values) => adminRequest(`/trains/${encodeURIComponent(id)}`, 'PUT', values)
export const getAdminRoute = (id) => adminRequest(`/trains/${encodeURIComponent(id)}/route`)
export const updateAdminRoute = (id, values) => adminRequest(`/trains/${encodeURIComponent(id)}/route`, 'PUT', values)
export const getAdminSchedules = () => adminRequest('/schedules')
export const createAdminSchedule = (values) => adminRequest('/schedules', 'POST', values)
export const updateAdminSchedule = (id, values) => adminRequest(`/schedules/${encodeURIComponent(id)}`, 'PUT', values)
export const getAdminBookings = () => adminRequest('/bookings')
export const getAdminAudit = () => adminRequest('/audit')
export const getAdminBooking = (pnr) => adminRequest(`/bookings/${encodeURIComponent(pnr)}`)
export const getAdminCancellationQuote = (pnr) => adminRequest(`/bookings/${encodeURIComponent(pnr)}/cancellation-quote`)
export const cancelAdminBooking = (pnr) => adminRequest(`/bookings/${encodeURIComponent(pnr)}/cancel`, 'POST', { confirm: true })
