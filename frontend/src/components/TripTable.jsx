import { NEXT_STATUSES } from '../constants';

const label = (status) => status.replace('_', ' ').toLowerCase();

// busyIds: trips that have a request running -> their buttons are disabled.
export default function TripTable({ trips, busyIds, onChangeStatus, onDelete }) {
  if (trips.length === 0) return <p className="empty">No trips found.</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Trip #</th>
            <th>Route</th>
            <th>Driver</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((trip) => {
            const busy = busyIds.has(trip.id);
            return (
            <tr key={trip.id} className={busy ? 'busy' : undefined} aria-busy={busy}>
              <td className="mono">{trip.tripNumber}</td>
              <td>
                {trip.source} → {trip.destination}
              </td>
              <td>{trip.driverName || <span className="muted">—</span>}</td>
              <td>
                <span className={`badge badge-${trip.status}`}>{label(trip.status)}</span>
              </td>
              <td className="muted">{new Date(trip.createdAt).toLocaleString()}</td>
              <td className="actions">
                {NEXT_STATUSES[trip.status].map((next) => (
                  <button key={next} disabled={busy} onClick={() => onChangeStatus(trip, next)}>
                    {label(next)}
                  </button>
                ))}
                <button className="danger" disabled={busy} onClick={() => onDelete(trip)}>
                  delete
                </button>
                {busy && <span className="muted small">saving…</span>}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
