/**
 * Service = business rules. It does not know about HTTP (req/res),
 * and it does not touch the database directly (that is the repository's job).
 */
const repo = require('./trip.repository');
const { prisma } = require('../../db/prisma');

// Status updates wait on a row lock while a competing update finishes, so allow a
// little more than Prisma's defaults (2s to get a connection, 5s per transaction).
const TX_OPTIONS = { maxWait: 10_000, timeout: 10_000 };
const { canTransition, getAllowedNextStatuses } = require('./trip.status');
const AppError = require('../../utils/AppError');

function samePayload(trip, input) {
  return (
    trip.tripNumber === input.tripNumber &&
    trip.source === input.source &&
    trip.destination === input.destination &&
    (trip.driverName ?? null) === (input.driverName ?? null)
  );
}

/**
 * Create a trip.
 * Duplicate protection works on two levels:
 *  1. tripNumber is UNIQUE in the database -> a second create with the same number gets 409.
 *  2. Optional "Idempotency-Key" header -> retrying the SAME request returns the
 *     original trip (200) instead of failing or creating a copy.
 *
 * @returns {{ trip: object, replayed: boolean }}
 */
async function createTrip(input, idempotencyKey) {
  const created = await repo.insert(input, idempotencyKey);
  if (created) return { trip: created, replayed: false };

  // insert returned nothing => this idempotency key was already used.
  const existing = await repo.findByIdempotencyKey(idempotencyKey);
  if (existing && samePayload(existing, input)) {
    return { trip: existing, replayed: true };
  }
  throw AppError.unprocessable(
    'IDEMPOTENCY_KEY_REUSED',
    'This Idempotency-Key was already used with a different request body'
  );
}

async function getTrip(id) {
  const trip = await repo.findById(id);
  if (!trip) throw AppError.notFound(`Trip ${id} not found`);
  return trip;
}

async function listTrips({ page, limit, status }) {
  const offset = (page - 1) * limit;
  const { trips, total } = await repo.list({ status, limit, offset });
  return {
    data: trips,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Change a trip's status safely, even when many requests arrive at the same time.
 *
 * How: inside a transaction we read the trip with `SELECT ... FOR UPDATE`.
 * That locks the row, so a second request for the same trip WAITS until the first
 * one commits. The second request then sees the NEW status and is validated
 * against it, so two requests can never both "win" and break the rules.
 */
async function updateTripStatus(id, { status, driverName }) {
  return prisma.$transaction(async (tx) => {
    const trip = await repo.findById(id, tx, { forUpdate: true });
    if (!trip) throw AppError.notFound(`Trip ${id} not found`);

    if (!canTransition(trip.status, status)) {
      throw AppError.conflict(
        'INVALID_STATUS_TRANSITION',
        `Cannot change status from ${trip.status} to ${status}`,
        { currentStatus: trip.status, requestedStatus: status, allowedNextStatuses: getAllowedNextStatuses(trip.status) }
      );
    }

    if (status === 'ASSIGNED' && !driverName && !trip.driverName) {
      throw AppError.unprocessable('DRIVER_REQUIRED', 'A driverName is required to assign a trip');
    }

    return repo.updateStatus(id, status, driverName, tx);
  }, TX_OPTIONS);
}

async function deleteTrip(id) {
  const deleted = await repo.deleteById(id);
  if (!deleted) throw AppError.notFound(`Trip ${id} not found`);
}

module.exports = { createTrip, getTrip, listTrips, updateTripStatus, deleteTrip };
