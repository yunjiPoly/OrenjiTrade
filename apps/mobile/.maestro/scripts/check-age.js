// Maestro runScript (runs on the host): checks on the isolated mobile E2E API (:8090) whether
// the account EMAIL / PASSWORD recorded the 18+ confirmation (`GET /me` →
// `onboarding.ageConfirmed`), after the app's onboarding age step. Only run accounts
// (@mobile-e2e.test) are checked.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, EXPECT ('true' | 'false').

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var expected = typeof EXPECT !== 'undefined' ? EXPECT : 'true';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-age.js only checks the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
  }
  return response.body ? json(response.body) : null;
}

var token = check(
  http.post(
    emulator + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  ),
  'emulator sign-in'
).idToken;
var me = check(
  http.get(api + '/api/v1/me', { headers: { Authorization: 'Bearer ' + token } }),
  'GET /me'
);
var confirmed = !!(me.onboarding && me.onboarding.ageConfirmed === true);
if (String(confirmed) !== expected) {
  throw new Error(
    'Expected onboarding.ageConfirmed to be ' + expected + ' for ' + EMAIL + ', got ' + confirmed
  );
}
output.ageCheck = { email: EMAIL, ageConfirmed: confirmed };
