// Maestro runScript (runs on the host): a suspended collector sees "Account suspended" (screen 44)
// while signed in and after signing in again (owner decision of 2026-10-28: a suspension leaves
// the login on). Driven through the local Firebase Auth emulator and the isolated mobile E2E API
// (:8090, database orenjitrade_mobile_e2e). Only fresh, fictional `@mobile-e2e.test` collectors of
// this run are created or suspended; the seed admin (docs/development/test-accounts.md) only signs
// in to suspend them, and is never changed.
//
// ACTION=setup creates Sam (the app user). Outputs: output.sam.{email, password, displayName,
//   handle, id}
// ACTION=suspend signs in as the seed admin and suspends ID through POST /admin/users/{id}/suspend,
//   until DAYS days from now at 17:00 UTC (the same date from UTC-12 to UTC+6), or open-ended with
//   DAYS=none. Output: output.suspension.untilText ("November 2, 2026", as the phone writes it in
//   English), empty when open-ended.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action ID, DAYS.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'smanual0';
var action = typeof ACTION !== 'undefined' ? ACTION : 'setup';

var SEED_ADMIN_EMAIL = 'admin@orenjitrade.test';
var SEED_ADMIN_PASSWORD = 'LocalDev!2026';
var MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

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

function emulatorSignIn(email, password) {
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

/** A fresh onboarded collector of this run. */
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
        games: ['yugioh'],
        languages: ['en'],
      }),
    }),
    'PUT /me/profile'
  );
  return { email: email, password: password, displayName: displayName, handle: handle, id: me.id };
}

if (action === 'setup') {
  output.sam = createCollector('sam', 'Sam Suspended');
} else if (action === 'suspend') {
  var target = typeof ID !== 'undefined' ? ID : '';
  var days = typeof DAYS !== 'undefined' ? DAYS : 'none';
  if (!target) {
    throw new Error('suspend needs ID');
  }
  var until = null;
  var untilText = '';
  if (days !== 'none') {
    var at = new Date(Date.now() + Number(days) * 86400000);
    var end = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 17, 0, 0, 0)
    );
    until = end.toISOString();
    untilText = MONTHS[end.getUTCMonth()] + ' ' + end.getUTCDate() + ', ' + end.getUTCFullYear();
  }
  var admin = emulatorSignIn(SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  check(
    http.post(api + '/api/v1/admin/users/' + target + '/suspend', {
      headers: jsonHeaders(admin),
      body: JSON.stringify({ reason: 'Maestro suspension of a fictional collector', until: until }),
    }),
    'POST /admin/users/{id}/suspend'
  );
  output.suspension = { untilText: untilText };
} else {
  throw new Error('Unknown ACTION ' + action);
}
