// Maestro runScript (runs on the host): checks what the isolated API (:8090) holds for a Maestro
// collector after the flow saved a trading area on the map. Signs in through the local Auth
// emulator with the collector's own test credentials and reads GET /api/v1/me/location.
//
// Asserts (ADR 0004): the centre is MANUAL (picked by hand, not the device), has at most 3
// decimals, is not the city preset the flow started from (the tap moved it), and the radius is
// RADIUS_KM. Outputs: output.area.{label, radiusKm}. Never prints coordinates.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, RADIUS_KM, NOT_LAT, NOT_LNG.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-area.js only reads the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status);
  }
  return json(response.body);
}

function decimals(value) {
  var text = String(value);
  return text.indexOf('.') < 0 ? 0 : text.split('.')[1].length;
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
var location = check(
  http.get(api + '/api/v1/me/location', {
    headers: { Authorization: 'Bearer ' + session.idToken },
  }),
  'GET /me/location'
);
var area = location.tradingArea;
if (!area) {
  throw new Error('No trading area was saved.');
}
if (area.source !== 'MANUAL') {
  throw new Error('Expected a MANUAL trading area, got ' + area.source + '.');
}
if (decimals(area.lat) > 3 || decimals(area.lng) > 3) {
  throw new Error('The saved centre has more than 3 decimals.');
}
if (String(area.lat) === String(NOT_LAT) && String(area.lng) === String(NOT_LNG)) {
  throw new Error('The saved centre is still the city preset: the map tap did not move it.');
}
if (String(area.radiusKm) !== String(RADIUS_KM)) {
  throw new Error('Expected a ' + RADIUS_KM + ' km radius, got ' + area.radiusKm + ' km.');
}
output.area = { label: area.label, radiusKm: area.radiusKm };
