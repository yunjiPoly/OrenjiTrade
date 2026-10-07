// Maestro runScript (runs on the host): records the 18+ confirmation (`AGE_CONFIRMATION`
// consent, the current version from GET /public/legal/documents) for the account EMAIL /
// PASSWORD through the local Firebase Auth emulator and the isolated mobile E2E API (:8090,
// database orenjitrade_mobile_e2e). Idempotent on the API. Used before the flows that sign in to
// a seed collector (the seed predates the rule: without this the app would show them the
// onboarding age step first; the step itself is proven by age-step-existing-account.yaml); the
// emulator account is only signed in to, the consent row lives in the isolated database.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD. Outputs: output.ageConfirmed.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
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
var auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

var me = check(http.get(api + '/api/v1/me', { headers: auth }), 'GET /me');
if (me.onboarding && me.onboarding.ageConfirmed === false) {
  var documents = check(
    http.get(api + '/api/v1/public/legal/documents', { headers: auth }),
    'GET /public/legal/documents'
  );
  var age = null;
  for (var i = 0; i < documents.length; i++) {
    if (documents[i].documentType === 'AGE_CONFIRMATION') {
      age = documents[i];
    }
  }
  if (!age) {
    throw new Error('The API does not publish the AGE_CONFIRMATION document.');
  }
  check(
    http.post(api + '/api/v1/me/consents', {
      headers: auth,
      body: JSON.stringify({ documentType: age.documentType, version: age.version }),
    }),
    'POST /me/consents (AGE_CONFIRMATION)'
  );
}
output.ageConfirmed = true;
