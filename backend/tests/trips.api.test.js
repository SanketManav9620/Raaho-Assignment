/**
 * API tests against a REAL PostgreSQL database (the one from docker-compose).
 * They are skipped automatically if the database is not reachable.
 *
 * WARNING: these tests delete all rows from the `trips` table before running.
 */
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { execSync } = require('node:child_process');
const path = require('node:path');
const { prisma } = require('../src/db/prisma');

const app = createApp();
let dbAvailable = true;

before(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Apply any pending migrations (same as `npm run migrate`).
    execSync('npx prisma migrate deploy', { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
    await prisma.trip.deleteMany();
  } catch (err) {
    dbAvailable = false;
    console.warn(`Skipping API tests: database not reachable (${err.message})`);
  }
});

after(() => prisma.$disconnect());

let counter = 0;
const newTrip = (overrides = {}) => ({
  tripNumber: `TRP-${Date.now()}-${++counter}`,
  source: 'Delhi',
  destination: 'Jaipur',
  ...overrides,
});

describe('Trip API', () => {
  test('POST /trips creates a trip with status CREATED', async (t) => {
    if (!dbAvailable) return t.skip();
    const body = newTrip({ driverName: 'Ravi' });
    const res = await request(app).post('/trips').send(body).expect(201);
    assert.equal(res.body.data.tripNumber, body.tripNumber);
    assert.equal(res.body.data.status, 'CREATED');
    assert.ok(res.body.data.id);
    assert.ok(res.body.data.createdAt);
  });

  test('POST /trips validates input', async (t) => {
    if (!dbAvailable) return t.skip();
    const res = await request(app)
      .post('/trips')
      .send({ tripNumber: '', source: 'A', destination: 'a', status: 'COMPLETED' })
      .expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.body.error.details));
    // All problems are reported at once, including the cross-field rule.
    const messages = res.body.error.details.map((d) => d.message);
    assert.ok(messages.includes('source and destination must be different'), messages.join(' | '));
    assert.ok(messages.some((m) => m.startsWith('tripNumber')), messages.join(' | '));
  });

  test('POST /trips rejects same source and destination on an otherwise valid body', async (t) => {
    if (!dbAvailable) return t.skip();
    const res = await request(app)
      .post('/trips')
      .send({ ...newTrip(), source: ' Delhi ', destination: 'delhi' })
      .expect(400);
    assert.deepEqual(res.body.error.details, [
      { field: 'destination', message: 'source and destination must be different' },
    ]);
  });

  test('POST /trips rejects invalid JSON', async (t) => {
    if (!dbAvailable) return t.skip();
    const res = await request(app)
      .post('/trips')
      .set('Content-Type', 'application/json')
      .send('{"bad json')
      .expect(400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  });

  test('duplicate tripNumber returns 409', async (t) => {
    if (!dbAvailable) return t.skip();
    const body = newTrip();
    await request(app).post('/trips').send(body).expect(201);
    const res = await request(app).post('/trips').send(body).expect(409);
    assert.equal(res.body.error.code, 'DUPLICATE_TRIP_NUMBER');
  });

  test('same Idempotency-Key replays the original trip instead of creating a new one', async (t) => {
    if (!dbAvailable) return t.skip();
    const body = newTrip();
    const key = `key-${Date.now()}`;
    const first = await request(app).post('/trips').set('Idempotency-Key', key).send(body).expect(201);
    const second = await request(app).post('/trips').set('Idempotency-Key', key).send(body).expect(200);
    assert.equal(second.body.data.id, first.body.data.id);
    assert.equal(second.headers['idempotent-replayed'], 'true');

    const reused = await request(app)
      .post('/trips')
      .set('Idempotency-Key', key)
      .send(newTrip())
      .expect(422);
    assert.equal(reused.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });

  test('concurrent POSTs with the same Idempotency-Key create exactly one trip', async (t) => {
    if (!dbAvailable) return t.skip();
    const body = newTrip();
    const key = `race-${Date.now()}`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/trips').set('Idempotency-Key', key).send(body))
    );
    const ids = new Set(results.map((r) => r.body.data.id));
    assert.equal(ids.size, 1);
    assert.equal(results.filter((r) => r.status === 201).length, 1);
  });

  test('GET /trips/:id returns the trip, 404 if missing, 400 if bad id', async (t) => {
    if (!dbAvailable) return t.skip();
    const { body } = await request(app).post('/trips').send(newTrip()).expect(201);
    const res = await request(app).get(`/trips/${body.data.id}`).expect(200);
    assert.equal(res.body.data.id, body.data.id);

    const missing = await request(app).get('/trips/00000000-0000-0000-0000-000000000000').expect(404);
    assert.equal(missing.body.error.code, 'NOT_FOUND');
    await request(app).get('/trips/not-a-uuid').expect(400);
  });

  test('GET /trips paginates and filters by status', async (t) => {
    if (!dbAvailable) return t.skip();
    await prisma.trip.deleteMany();
    for (let i = 0; i < 5; i++) await request(app).post('/trips').send(newTrip()).expect(201);
    const { body } = await request(app).post('/trips').send(newTrip()).expect(201);
    await request(app).patch(`/trips/${body.data.id}/status`).send({ status: 'CANCELLED' }).expect(200);

    const page1 = await request(app).get('/trips?page=1&limit=4').expect(200);
    assert.equal(page1.body.data.length, 4);
    assert.deepEqual(page1.body.pagination, { page: 1, limit: 4, total: 6, totalPages: 2 });

    const page2 = await request(app).get('/trips?page=2&limit=4').expect(200);
    assert.equal(page2.body.data.length, 2);

    const cancelled = await request(app).get('/trips?status=CANCELLED').expect(200);
    assert.equal(cancelled.body.pagination.total, 1);
    assert.equal(cancelled.body.data[0].status, 'CANCELLED');

    await request(app).get('/trips?status=FLYING').expect(400);
    await request(app).get('/trips?limit=1000').expect(400);
  });

  test('status moves forward and cannot go backwards or leave COMPLETED', async (t) => {
    if (!dbAvailable) return t.skip();
    const { body } = await request(app).post('/trips').send(newTrip()).expect(201);
    const url = `/trips/${body.data.id}/status`;

    // Assigning without a driver fails
    const noDriver = await request(app).patch(url).send({ status: 'ASSIGNED' }).expect(422);
    assert.equal(noDriver.body.error.code, 'DRIVER_REQUIRED');

    // Skipping a step fails
    await request(app).patch(url).send({ status: 'COMPLETED' }).expect(409);

    const assigned = await request(app).patch(url).send({ status: 'ASSIGNED', driverName: 'Amit' }).expect(200);
    assert.equal(assigned.body.data.driverName, 'Amit');

    const back = await request(app).patch(url).send({ status: 'CREATED' }).expect(409);
    assert.equal(back.body.error.code, 'INVALID_STATUS_TRANSITION');
    assert.deepEqual(back.body.error.details.allowedNextStatuses, ['IN_TRANSIT', 'CANCELLED']);

    await request(app).patch(url).send({ status: 'IN_TRANSIT' }).expect(200);
    await request(app).patch(url).send({ status: 'COMPLETED' }).expect(200);
    await request(app).patch(url).send({ status: 'CANCELLED' }).expect(409);
  });

  test('concurrent status updates: exactly one wins, final state is consistent', async (t) => {
    if (!dbAvailable) return t.skip();
    const { body } = await request(app).post('/trips').send(newTrip({ driverName: 'Sara' })).expect(201);
    const url = `/trips/${body.data.id}/status`;

    // 10 requests race: half try ASSIGNED, half try CANCELLED. Only one may succeed.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(app).patch(url).send({ status: i % 2 ? 'ASSIGNED' : 'CANCELLED' })
      )
    );
    const winners = results.filter((r) => r.status === 200);
    assert.equal(winners.length, 1);
    assert.ok(results.filter((r) => r.status !== 200).every((r) => r.status === 409));

    const final = await request(app).get(`/trips/${body.data.id}`).expect(200);
    assert.equal(final.body.data.status, winners[0].body.data.status);
  });

  test('DELETE /trips/:id removes the trip', async (t) => {
    if (!dbAvailable) return t.skip();
    const { body } = await request(app).post('/trips').send(newTrip()).expect(201);
    await request(app).delete(`/trips/${body.data.id}`).expect(204);
    await request(app).get(`/trips/${body.data.id}`).expect(404);
    await request(app).delete(`/trips/${body.data.id}`).expect(404);
  });

  test('unknown route returns 404 in the standard error format', async (t) => {
    if (!dbAvailable) return t.skip();
    const res = await request(app).get('/nope').expect(404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });
});
