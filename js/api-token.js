(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AscendApiToken = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const TOKEN_TTL_SECONDS = 60 * 60;

  function requireValue(value, message) {
    if (!value || (typeof value === 'string' && !value.trim())) {
      throw new Error(message);
    }
    return value;
  }

  function buildTemporaryApiTokenPayload({ uid, email, idToken, projectId, now = new Date() }) {
    requireValue(uid, 'Missing uid. Please sign in before generating an API token.');
    requireValue(idToken, 'Missing Firebase ID token. Please sign in again.');
    requireValue(projectId, 'Missing Firebase projectId. Firebase is not configured.');

    const issuedAt = new Date(now);
    const expiresAt = new Date(issuedAt.getTime() + TOKEN_TTL_SECONDS * 1000);

    return {
      tokenType: 'firebase-id-token',
      projectId,
      uid,
      email: email || '',
      idToken,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: TOKEN_TTL_SECONDS,
      usage: 'Send this JSON to Hermes. It is temporary and expires in about 1 hour. Do not post it publicly.'
    };
  }

  function formatTemporaryApiTokenForCopy(payload) {
    return JSON.stringify(payload, null, 2);
  }

  return {
    TOKEN_TTL_SECONDS,
    buildTemporaryApiTokenPayload,
    formatTemporaryApiTokenForCopy
  };
});
