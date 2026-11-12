
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  authorizeBookingAccess,
} = require('../src/middleware/bookingAuthorization');

function runMiddleware(user, booking) {
  let status;
  let body;
  let nextCalled = false;

  const req = { user, booking };

  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      body = data;
      return this;
    },
  };

  authorizeBookingAccess(req, res, () => {
    nextCalled = true;
  });

  return { status, body, nextCalled };
}

test('allows a passenger to access their own booking', () => {
  const result = runMiddleware(
    { user_id: 1, role: 'PASSENGER' },
    { booking_id: 101, user_id: 1 },
  );

  assert.equal(result.nextCalled, true);
});

test('rejects another passenger booking', () => {
  const result = runMiddleware(
    { user_id: 1, role: 'PASSENGER' },
    { booking_id: 102, user_id: 2 },
  );

  assert.equal(result.status, 403);
  assert.equal(result.nextCalled, false);
});

test('allows an administrator to access another booking', () => {
  const result = runMiddleware(
    { user_id: 99, role: 'ADMIN' },
    { booking_id: 102, user_id: 2 },
  );

  assert.equal(result.nextCalled, true);
});

test('rejects unauthenticated requests', () => {
  const result = runMiddleware(
    null,
    { booking_id: 101, user_id: 1 },
  );

  assert.equal(result.status, 401);
});

test('rejects a user object without an ID', () => {
  const result = runMiddleware(
    { role: 'PASSENGER' },
    { booking_id: 101, user_id: 1 },
  );

  assert.equal(result.status, 401);
});

test('returns not found for a missing booking', () => {
  const result = runMiddleware(
    { user_id: 1, role: 'PASSENGER' },
    null,
  );

  assert.equal(result.status, 404);
});
