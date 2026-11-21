import { useState } from 'react';
import { api } from '../api';

const EMPTY = { tripNumber: '', source: '', destination: '', driverName: '' };

export default function CreateTripForm({ onCreated, onError }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  // One key per "new trip" form. If the request is retried, the same key is sent,
  // so the server will not create a duplicate. A new key is made after success.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, driverName: form.driverName.trim() || undefined };
      await api.createTrip(payload, idempotencyKey);
      setForm(EMPTY);
      setIdempotencyKey(crypto.randomUUID());
      onCreated();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>New trip</h2>
      <div className="form-grid">
        <label>
          Trip number
          <input value={form.tripNumber} onChange={update('tripNumber')} placeholder="TRP-1001" required />
        </label>
        <label>
          Source
          <input value={form.source} onChange={update('source')} placeholder="Delhi" required />
        </label>
        <label>
          Destination
          <input value={form.destination} onChange={update('destination')} placeholder="Jaipur" required />
        </label>
        <label>
          Driver (optional)
          <input value={form.driverName} onChange={update('driverName')} placeholder="Ravi Kumar" />
        </label>
      </div>
      <button type="submit" className="primary" disabled={saving}>
        {saving ? 'Creating…' : 'Create trip'}
      </button>
    </form>
  );
}
