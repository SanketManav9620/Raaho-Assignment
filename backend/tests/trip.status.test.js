// Unit tests for the status rules. No database needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canTransition, TRIP_STATUSES } = require('../src/modules/trips/trip.status');

test('happy path CREATED -> ASSIGNED -> IN_TRANSIT -> COMPLETED is allowed', () => {
  assert.ok(canTransition('CREATED', 'ASSIGNED'));
  assert.ok(canTransition('ASSIGNED', 'IN_TRANSIT'));
  assert.ok(canTransition('IN_TRANSIT', 'COMPLETED'));
});

test('cancelling is allowed before the trip starts moving', () => {
  assert.ok(canTransition('CREATED', 'CANCELLED'));
  assert.ok(canTransition('ASSIGNED', 'CANCELLED'));
  assert.ok(!canTransition('IN_TRANSIT', 'CANCELLED'));
});

test('moving backwards is not allowed', () => {
  assert.ok(!canTransition('ASSIGNED', 'CREATED'));
  assert.ok(!canTransition('IN_TRANSIT', 'ASSIGNED'));
  assert.ok(!canTransition('COMPLETED', 'IN_TRANSIT'));
});

test('skipping steps is not allowed', () => {
  assert.ok(!canTransition('CREATED', 'IN_TRANSIT'));
  assert.ok(!canTransition('CREATED', 'COMPLETED'));
  assert.ok(!canTransition('ASSIGNED', 'COMPLETED'));
});

test('COMPLETED and CANCELLED are final', () => {
  for (const to of TRIP_STATUSES) {
    assert.ok(!canTransition('COMPLETED', to), `COMPLETED -> ${to}`);
    assert.ok(!canTransition('CANCELLED', to), `CANCELLED -> ${to}`);
  }
});

test('same status is not a transition', () => {
  for (const s of TRIP_STATUSES) assert.ok(!canTransition(s, s));
});
