// Maestro runScript (runs on the host): the member of the usage-limit flow, driven through the
// local Firebase Auth emulator and the isolated mobile E2E API (:8090, database
// orenjitrade_mobile_e2e). Only a fresh, fictional `@mobile-e2e.test` account of this run is
// created; seed accounts are never touched.
//
// ACTION=binders-full creates Lee, onboarded, with five binders: the binders limit every collector
//   has (stage F1: the same limits for everyone, nothing to buy).
//   Output: output.lee.{email, password, displayName}
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'rmanual0';
var action = typeof ACTION !== 'undefined' ? ACTION : 'binders-full';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
  }
  return response.body ? json(response.body) : null;
}

function jsonHeaders(token) {
  return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}

/** Records the 18+ confirmation (`AGE_CONFIRMATION`, its current version) for the account. */
function confirmAge(token) {
  var documents = check(
    http.get(api + '/api/v1/public/legal/documents', { headers: jsonHeaders(token) }),
    'GET /public/legal/documents'
  );
  for (var d = 0; d < documents.length; d++) {
    if (documents[d].documentType === 'AGE_CONFIRMATION') {
      check(
        http.post(api + '/api/v1/me/consents', {
          headers: jsonHeaders(token),
          body: JSON.stringify({
            documentType: documents[d].documentType,
            version: documents[d].version,
          }),
        }),
        'POST /me/consents (AGE_CONFIRMATION)'
      );
    }
  }
}

/** A fresh onboarded collector (no location). */
function createCollector(prefix, displayName) {
  var suffix = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  var email = 'm-' + runId + '-maestro-' + prefix + '-' + suffix + '@mobile-e2e.test';
  var password = 'Maestro-Pass-42';
  var handle = ('m' + prefix + '_' + suffix)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
  var token = check(
    http.post(emulator + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-key', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
    }),
    'emulator sign-up'
  ).idToken;
  var me = check(http.get(api + '/api/v1/me', { headers: jsonHeaders(token) }), 'GET /me');
  for (var i = 0; i < me.requiredConsents.length; i++) {
    check(
      http.post(api + '/api/v1/me/consents', {
        headers: jsonHeaders(token),
        body: JSON.stringify(me.requiredConsents[i]),
      }),
      'POST /me/consents'
    );
  }
  confirmAge(token);
  check(
    http.put(api + '/api/v1/me/profile', {
      headers: jsonHeaders(token),
      body: JSON.stringify({
        handle: handle,
        displayName: displayName,
        bio: 'Maestro bio.',
        games: ['pokemon'],
        languages: ['en'],
      }),
    }),
    'PUT /me/profile'
  );
  return { email: email, password: password, displayName: displayName, token: token };
}

if (action === 'binders-full') {
  var lee = createCollector('lee', 'Lee Maestro');
  var limits = check(
    http.get(api + '/api/v1/me/limits', { headers: jsonHeaders(lee.token) }),
    'GET /me/limits'
  );
  var binders = null;
  for (var l = 0; l < limits.limits.length; l++) {
    if (limits.limits[l].key === 'binders.max') {
      binders = limits.limits[l];
    }
  }
  if (!binders || binders.limit !== 5) {
    throw new Error('Expected binders.max = 5 for every collector, got ' + JSON.stringify(binders));
  }
  for (var b = 1; b <= 5; b++) {
    check(
      http.post(api + '/api/v1/binders', {
        headers: jsonHeaders(lee.token),
        body: JSON.stringify({ name: 'Maestro binder ' + b }),
      }),
      'POST /binders ' + b
    );
  }
  output.lee = { email: lee.email, password: lee.password, displayName: lee.displayName };
} else {
  throw new Error('Unknown ACTION ' + action);
}
