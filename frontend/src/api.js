// All calls to the backend live here, so components stay simple.
// Empty = same origin; in dev the Vite proxy forwards /trips to the API (see vite.config.js).
// Set VITE_API_URL to call an API on another host directly (that host must allow CORS).
const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Backend errors look like: { error: { code, message, details } }
    const err = body.error || {};
    const details = Array.isArray(err.details) ? err.details.map((d) => d.message).join(', ') : '';
    throw new Error(details ? `${err.message}: ${details}` : err.message || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  listTrips: ({ page, limit, status }) => {
    const params = new URLSearchParams({ page, limit });
    if (status) params.set('status', status);
    return request(`/trips?${params}`);
  },
  // idempotencyKey makes a double-click / retry safe: the server creates the trip only once.
  createTrip: (trip, idempotencyKey) =>
    request('/trips', {
      method: 'POST',
      body: JSON.stringify(trip),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  updateStatus: (id, status, driverName) =>
    request(`/trips/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(driverName ? { status, driverName } : { status }),
    }),
  deleteTrip: (id) => request(`/trips/${id}`, { method: 'DELETE' }),
};
