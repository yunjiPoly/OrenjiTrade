// Maestro runScript (runs on the host): the member of the Premium flow, driven through the local
// Firebase Auth emulator and the isolated mobile E2E API (:8090, database orenjitrade_mobile_e2e)
// with the local fake billing provider (no card, no money). Only fresh, fictional
// `@mobile-e2e.test` accounts of this run are created or used; seed accounts are never touched.
// (The protected-payment actions left with trades and payments, ADR 0018.)
//
// ACTION=premium creates Pat (FREE) with five binders, the most the free plan allows.
//   Output: output.pat.{email, password, displayName}
// ACTION=expect-plan checks, as Pat (EMAIL / PASSWORD), that the plan is PLAN.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD, PLAN.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'rmanual0';
var action = typeof ACTION !== 'undefined' ? ACTION : 'setup';

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

function signIn(email, password) {
  if (!/@mobile-e2e\.test$/.test(email)) {
    throw new Error('billing.js only acts as the run accounts (@mobile-e2e.test).');
  }
  return check(
    http.post(
      emulator +
        '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
      }
    ),
    'emulator sign-in'
  ).idToken;
}

/** A fresh onboarded collector; with `place` (country and state), discoverable there. */
function createCollector(prefix, displayName, place) {
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
  // The 18+ confirmation (launch readiness): the current AGE_CONFIRMATION version, like the app.
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
  if (place) {
    check(
      http.put(api + '/api/v1/me/location', {
        headers: jsonHeaders(token),
        body: JSON.stringify({
          countryCode: place.countryCode,
          subdivisionCode: place.subdivisionCode,
          city: null,
          showCity: true,
        }),
      }),
      'PUT /me/location'
    );
    var privacy = check(
      http.get(api + '/api/v1/me/settings/privacy', { headers: jsonHeaders(token) }),
      'GET privacy'
    );
    privacy.discoverable = true;
    check(
      http.put(api + '/api/v1/me/settings/privacy', {
        headers: jsonHeaders(token),
        body: JSON.stringify(privacy),
      }),
      'PUT privacy'
    );
  }
  return {
    email: email,
    password: password,
    displayName: displayName,
    handle: handle,
    token: token,
  };
}

if (action === 'premium') {
  var pat = createCollector('pat', 'Pat Maestro', null);
  for (var b = 1; b <= 5; b++) {
    check(
      http.post(api + '/api/v1/binders', {
        headers: jsonHeaders(pat.token),
        body: JSON.stringify({ name: 'Maestro binder ' + b }),
      }),
      'POST /binders ' + b
    );
  }
  output.pat = { email: pat.email, password: pat.password, displayName: pat.displayName };
} else if (action === 'expect-plan') {
  var plan = check(
    http.get(api + '/api/v1/me/plan', { headers: jsonHeaders(signIn(EMAIL, PASSWORD)) }),
    'GET /me/plan'
  );
  if (!plan.plan || plan.plan.code !== PLAN) {
    throw new Error('Expected the ' + PLAN + ' plan, got ' + JSON.stringify(plan.plan));
  }
} else {
  throw new Error('Unknown ACTION ' + action);
}
