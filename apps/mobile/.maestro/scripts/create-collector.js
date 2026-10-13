// Maestro runScript (runs on the host, not on the device): creates a fresh, fictional collector
// through the local Firebase Auth emulator and the isolated mobile E2E API (:8090, database
// orenjitrade_mobile_e2e), like the web E2E helper `createOnboardedCollector`: accepted terms, a
// saved profile with one game (onboarding complete), the 18+ confirmation (unless
// CONFIRM_AGE=false), no location, not discoverable. Seed accounts are never modified.
//
// The email is `m-<RUN_ID>-maestro-<PREFIX>-<suffix>@mobile-e2e.test`, so
// `npm run test:mobile:maestro` deletes exactly the accounts of its run from the emulator at the
// end (never @orenjitrade.test seeds, never the web suite's @example.test accounts).
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, PREFIX (optional), DISPLAY_NAME (optional),
// CONFIRM_AGE (optional, 'false' skips the 18+ confirmation).
// Outputs: output.collector.{email, password, handle, displayName}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'rmanual0';
var prefix = typeof PREFIX !== 'undefined' ? PREFIX : 'collector';
var displayName = typeof DISPLAY_NAME !== 'undefined' ? DISPLAY_NAME : 'Maestro Collector';
var confirmAge = typeof CONFIRM_AGE === 'undefined' || CONFIRM_AGE !== 'false';

if (/:8080\/?$/.test(api)) {
  throw new Error(
    'Refusing to use the developer API ' +
      api +
      ': Maestro flows only use the isolated API on :8090.'
  );
}

var suffix = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
var email = 'm-' + runId + '-maestro-' + prefix + '-' + suffix + '@mobile-e2e.test';
var password = 'Maestro-Pass-42';
var handle = ('m' + prefix + '_' + suffix)
  .toLowerCase()
  .replace(/[^a-z0-9_]/g, '')
  .slice(0, 24);

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
  }
  return response.body ? json(response.body) : null;
}

var signUp = check(
  http.post(emulator + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-key', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
  }),
  'emulator sign-up'
);
var auth = { Authorization: 'Bearer ' + signUp.idToken, 'Content-Type': 'application/json' };

var me = check(http.get(api + '/api/v1/me', { headers: auth }), 'GET /me');
for (var i = 0; i < me.requiredConsents.length; i++) {
  check(
    http.post(api + '/api/v1/me/consents', {
      headers: auth,
      body: JSON.stringify(me.requiredConsents[i]),
    }),
    'POST /me/consents'
  );
}

// The 18+ confirmation (launch readiness), like the app's sign-up; CONFIRM_AGE=false creates an
// account from before the rule, which the app sends to the onboarding age step.
if (confirmAge) {
  var documents = check(
    http.get(api + '/api/v1/public/legal/documents', { headers: auth }),
    'GET /public/legal/documents'
  );
  for (var d = 0; d < documents.length; d++) {
    if (documents[d].documentType === 'AGE_CONFIRMATION') {
      check(
        http.post(api + '/api/v1/me/consents', {
          headers: auth,
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

check(
  http.put(api + '/api/v1/me/profile', {
    headers: auth,
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

output.collector = { email: email, password: password, handle: handle, displayName: displayName };
