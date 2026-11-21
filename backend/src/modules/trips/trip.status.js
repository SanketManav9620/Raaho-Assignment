/**
 * Trip status rules ("state machine").
 *
 *   CREATED ──► ASSIGNED ──► IN_TRANSIT ──► COMPLETED
 *      │            │
 *      └──► CANCELLED ◄──┘
 *
 * - Trips can only move forward.
 * - COMPLETED and CANCELLED are final (no way out).
 * - A trip can be cancelled before it starts moving (CREATED or ASSIGNED),
 *   but not once it is IN_TRANSIT.
 */
const TRIP_STATUSES = Object.freeze(['CREATED', 'ASSIGNED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED']);

const ALLOWED_TRANSITIONS = Object.freeze({
  CREATED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
});

function getAllowedNextStatuses(from) {
  return ALLOWED_TRANSITIONS[from] || [];
}

function canTransition(from, to) {
  return getAllowedNextStatuses(from).includes(to);
}

module.exports = { TRIP_STATUSES, ALLOWED_TRANSITIONS, getAllowedNextStatuses, canTransition };
