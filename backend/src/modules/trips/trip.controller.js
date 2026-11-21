/**
 * Controller = reads the HTTP request, calls the service, sends the HTTP response.
 * Validation already happened in the `validate` middleware (see trip.routes.js).
 * Express 5 forwards errors from async functions to the error handler automatically.
 */
const service = require('./trip.service');
const AppError = require('../../utils/AppError');

async function create(req, res) {
  const idempotencyKey = req.get('Idempotency-Key');
  if (idempotencyKey !== undefined && (idempotencyKey.trim() === '' || idempotencyKey.length > 255)) {
    throw AppError.badRequest('Idempotency-Key header must be 1-255 characters');
  }

  const { trip, replayed } = await service.createTrip(req.validated.body, idempotencyKey);
  if (replayed) res.set('Idempotent-Replayed', 'true');
  res.status(replayed ? 200 : 201).location(`/trips/${trip.id}`).json({ data: trip });
}

async function list(req, res) {
  res.json(await service.listTrips(req.validated.query));
}

async function getById(req, res) {
  res.json({ data: await service.getTrip(req.validated.params.id) });
}

async function updateStatus(req, res) {
  const trip = await service.updateTripStatus(req.validated.params.id, req.validated.body);
  res.json({ data: trip });
}

async function remove(req, res) {
  await service.deleteTrip(req.validated.params.id);
  res.status(204).end();
}

module.exports = { create, list, getById, updateStatus, remove };
