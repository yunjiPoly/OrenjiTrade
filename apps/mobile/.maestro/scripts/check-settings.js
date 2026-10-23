// Maestro runScript (runs on the host): checks what the isolated API (:8090) holds after a flow
// walked Settings (stage R13). Signs in through the local Auth emulator with the run collector's
// own test credentials, then reads GET /api/v1/me/settings/privacy and GET
// /api/v1/me/deletion-requests.
//
// Asserts: `wishlistVisible` and `discoverable` are WISHLIST and DISCOVERABLE ('true' or 'false'),
// `profileVisibility` is PROFILE_VISIBILITY when given, and no deletion was requested (the flow
// stopped at the confirmation sheet).
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, WISHLIST, DISCOVERABLE,
// PROFILE_VISIBILITY (optional).

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-settings.js only reads the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status);
  }
  return json(response.body);
}

var session = check(
  http.post(
    emulator + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  ),
  'emulator sign-in'
);
var headers = { headers: { Authorization: 'Bearer ' + session.idToken } };

var privacy = check(http.get(api + '/api/v1/me/settings/privacy', headers), 'GET privacy');
if (String(privacy.wishlistVisible) !== WISHLIST) {
  throw new Error(
    'Expected wishlistVisible ' + WISHLIST + ', got ' + privacy.wishlistVisible + '.'
  );
}
if (String(privacy.discoverable) !== DISCOVERABLE) {
  throw new Error('Expected discoverable ' + DISCOVERABLE + ', got ' + privacy.discoverable + '.');
}
if (
  typeof PROFILE_VISIBILITY !== 'undefined' &&
  PROFILE_VISIBILITY &&
  privacy.profileVisibility !== PROFILE_VISIBILITY
) {
  throw new Error(
    'Expected profileVisibility ' + PROFILE_VISIBILITY + ', got ' + privacy.profileVisibility + '.'
  );
}

var requests = check(
  http.get(api + '/api/v1/me/deletion-requests', headers),
  'GET /me/deletion-requests'
);
var pending = requests.filter(function (request) {
  return request.status === 'PENDING';
});
if (pending.length > 0) {
  throw new Error('A deletion was requested, but the flow stopped at the sheet.');
}
output.settings = { wishlistVisible: privacy.wishlistVisible };
