export const STATUSES = ['CREATED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];

// Same rules as the backend (backend/src/modules/trips/trip.status.js).
// The UI uses this only to decide which buttons to show; the server still enforces the rules.
export const NEXT_STATUSES = {
  CREATED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};
