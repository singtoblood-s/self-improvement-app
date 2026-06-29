const assert = require('assert');
const { buildTemporaryApiTokenPayload, formatTemporaryApiTokenForCopy } = require('../js/api-token.js');

const now = new Date('2026-06-29T12:00:00.000Z');
const payload = buildTemporaryApiTokenPayload({
  uid: 'uid_123',
  email: 'user@example.com',
  idToken: 'firebase-id-token-abc',
  projectId: 'self-improve-820d8',
  now,
});

assert.strictEqual(payload.tokenType, 'firebase-id-token');
assert.strictEqual(payload.projectId, 'self-improve-820d8');
assert.strictEqual(payload.uid, 'uid_123');
assert.strictEqual(payload.email, 'user@example.com');
assert.strictEqual(payload.idToken, 'firebase-id-token-abc');
assert.strictEqual(payload.expiresAt, '2026-06-29T13:00:00.000Z');
assert.strictEqual(payload.expiresInSeconds, 3600);

const formatted = formatTemporaryApiTokenForCopy(payload);
const reparsed = JSON.parse(formatted);
assert.deepStrictEqual(reparsed, payload);
assert.ok(formatted.includes('firebase-id-token-abc'));

assert.throws(
  () => buildTemporaryApiTokenPayload({ uid: '', email: 'u@example.com', idToken: 'token', projectId: 'p', now }),
  /Missing uid/
);
assert.throws(
  () => buildTemporaryApiTokenPayload({ uid: 'uid', email: 'u@example.com', idToken: '', projectId: 'p', now }),
  /Missing Firebase ID token/
);
assert.throws(
  () => buildTemporaryApiTokenPayload({ uid: 'uid', email: 'u@example.com', idToken: 'token', projectId: '', now }),
  /Missing Firebase projectId/
);

console.log('api token helper tests passed');
