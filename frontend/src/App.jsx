import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { STATUSES } from './constants';
import CreateTripForm from './components/CreateTripForm';
import TripTable from './components/TripTable';

const PAGE_SIZE = 10;

export default function App() {
  const [trips, setTrips] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 0, total: 0 });
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listTrips({ page, limit: PAGE_SIZE, status: statusFilter });
      setTrips(res.data);
      setPagination(res.pagination);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  /**
   * Prevents repeated clicks on the same trip while a request is running.
   * - busyRef blocks a 2nd click INSTANTLY (React state updates are not instant,
   *   so two very fast clicks could both get through if we only used state).
   * - busyIds (state) re-renders the row so its buttons look disabled.
   * The row stays locked until the fresh list has loaded, so the user never
   * clicks a button that belongs to an old status.
   */
  const busyRef = useRef(new Set());
  const [busyIds, setBusyIds] = useState(() => new Set());

  async function runForTrip(tripId, action) {
    if (busyRef.current.has(tripId)) return; // already working on this trip: ignore the click
    busyRef.current.add(tripId);
    setBusyIds(new Set(busyRef.current));
    try {
      setError('');
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      await loadTrips(); // show the latest state (someone else may have changed it too)
      busyRef.current.delete(tripId);
      setBusyIds(new Set(busyRef.current));
    }
  }

  function handleChangeStatus(trip, next) {
    if (busyRef.current.has(trip.id)) return;
    let driverName;
    if (next === 'ASSIGNED' && !trip.driverName) {
      driverName = window.prompt('Driver name for this trip?');
      if (!driverName) return;
    }
    runForTrip(trip.id, () => api.updateStatus(trip.id, next, driverName));
  }

  function handleDelete(trip) {
    if (busyRef.current.has(trip.id)) return;
    if (!window.confirm(`Delete trip ${trip.tripNumber}?`)) return;
    runForTrip(trip.id, () => api.deleteTrip(trip.id));
  }

  return (
    <main className="container">
      <header>
        <h1>Trip Manager</h1>
        <p className="muted">Create trips, move them through their lifecycle, and filter by status.</p>
      </header>

      {error && (
        <div className="alert" role="alert">
          {error}
          <button className="link" onClick={() => setError('')}>dismiss</button>
        </div>
      )}

      <CreateTripForm
        onCreated={() => {
          setError('');
          setPage(1);
          loadTrips();
        }}
        onError={setError}
      />

      <section className="card">
        <div className="toolbar">
          <h2>Trips {loading && <span className="muted small">loading…</span>}</h2>
          <label>
            Status&nbsp;
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>

        <TripTable trips={trips} busyIds={busyIds} onChangeStatus={handleChangeStatus} onDelete={handleDelete} />

        <div className="pager">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span className="muted">
            Page {pagination.totalPages === 0 ? 0 : pagination.page} of {pagination.totalPages} · {pagination.total} trips
          </span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      </section>
    </main>
  );
}
