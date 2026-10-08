// Maestro runScript (runs on the host): checks what the isolated API (:8090) holds for a Maestro
// collector after the flow declared where they are with the pickers. Signs in through the local
// Auth emulator with the collector's own test credentials and reads GET /api/v1/me/location.
//
// Asserts (ADR 0017): the declared country and subdivision are COUNTRY and SUBDIVISION, the city
// is CITY (or none when CITY is empty), and the answer holds no coordinate, radius or distance
// field at all. Outputs: output.location.{label, regionCode}.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, COUNTRY, SUBDIVISION, CITY.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var city = typeof CITY !== 'undefined' ? CITY : '';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-location.js only reads the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status);
  }
  return json(response.body);
}

/** Paths of every coordinate, radius or distance key in a JSON value. */
function geoKeys(value, path) {
  var found = [];
  if (value && typeof value === 'object') {
    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }
      if (
        /^(lat|lng|latitude|longitude|point|publicPoint|homePoint|tradingArea|radius|radiusKm|distance|distanceBucket)$/i.test(
          key
        )
      ) {
        found.push(path + '.' + key);
      }
      found = found.concat(geoKeys(value[key], path + '.' + key));
    }
  }
  return found;
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
var answer = check(
  http.get(api + '/api/v1/me/location', {
    headers: { Authorization: 'Bearer ' + session.idToken },
  }),
  'GET /me/location'
);
var place = answer.location;
if (!place) {
  throw new Error('No location was saved.');
}
if (place.countryCode !== COUNTRY || place.subdivisionCode !== SUBDIVISION) {
  throw new Error(
    'Expected ' +
      COUNTRY +
      '/' +
      SUBDIVISION +
      ', got ' +
      place.countryCode +
      '/' +
      place.subdivisionCode +
      '.'
  );
}
if ((place.city || '') !== city) {
  throw new Error('Expected the city "' + city + '", got "' + (place.city || '') + '".');
}
var leaks = geoKeys(answer, '$');
if (leaks.length > 0) {
  throw new Error('GET /me/location carries coordinate or distance fields: ' + leaks.join(', '));
}
output.location = { label: place.label, regionCode: place.regionCode };
