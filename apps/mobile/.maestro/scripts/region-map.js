// Maestro runScript (runs on the host): reads what the region map of the isolated API holds for
// one state or province, through the endpoints of the map (no write):
//   GET /regions/{region}/binder-counts
//   GET /regions/{region}/subdivisions/{code}/binders
// The map flows then open that state and expect the seed binder named BINDER in its list, with
// its owner and the owner's state or province and country. Since stage R15 a signed-out caller
// never reads who owns a binder (`PrivacyPolicyService.canSeeWho`): the list is read once signed
// out, where the owner's handle and name must be null and the place kept, and once signed in as
// the seed collector (SEED_EMAIL / SEED_PASSWORD, read only), which gives the handle and the name
// the flows look for.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, SEED_EMAIL, SEED_PASSWORD, REGION (default
// americas-north), CODE (default CA-QC), BINDER (the name of a seed binder of that place, default
// "Pokémon holo binder"), GAME (a game slug: the counts and the list of that game only, as the
// phone asks them since stage G; every game without it).
// Outputs: output.place.{region, code, count}, output.binder.{id, name, handle, owner, place}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var region = typeof REGION !== 'undefined' ? REGION : 'americas-north';
var code = typeof CODE !== 'undefined' ? CODE : 'CA-QC';
var wanted = typeof BINDER !== 'undefined' ? BINDER : 'Pokémon holo binder';
var game = typeof GAME !== 'undefined' && GAME ? GAME : null;
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var seedEmail = typeof SEED_EMAIL !== 'undefined' ? SEED_EMAIL : 'collector1@orenjitrade.test';
var seedPassword = typeof SEED_PASSWORD !== 'undefined' ? SEED_PASSWORD : 'LocalDev!2026';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}

var counts = http.get(
  api + '/api/v1/regions/' + region + '/binder-counts' + (game ? '?game=' + game : '')
);
if (!counts.ok) {
  throw new Error('GET /regions/' + region + '/binder-counts failed: HTTP ' + counts.status);
}
var count = 0;
var subdivisions = json(counts.body).subdivisions || [];
for (var i = 0; i < subdivisions.length; i++) {
  if (subdivisions[i].code === code) {
    count = subdivisions[i].binderCount;
  }
}
if (count === 0) {
  throw new Error(code + ' holds no public binder in the seed data of ' + region + '.');
}

var listUrl =
  api +
  '/api/v1/regions/' +
  region +
  '/subdivisions/' +
  code +
  '/binders?limit=50' +
  (game ? '&game=' + game : '');

function wantedBinder(response, who) {
  if (!response.ok) {
    throw new Error(
      'GET /regions/' +
        region +
        '/subdivisions/' +
        code +
        '/binders (' +
        who +
        '): HTTP ' +
        response.status
    );
  }
  var binders = json(response.body).items || [];
  for (var j = 0; j < binders.length; j++) {
    if (binders[j].name === wanted) {
      return binders[j];
    }
  }
  throw new Error('No public binder named "' + wanted + '" in ' + code + ' (' + who + ').');
}

// Signed out (a guest, stage R15): the place, never who.
var anonymous = wantedBinder(http.get(listUrl), 'signed out');
if (!anonymous.owner || anonymous.owner.handle !== null || anonymous.owner.displayName !== null) {
  throw new Error(
    'A signed-out caller reads who owns "' + wanted + '": ' + JSON.stringify(anonymous.owner)
  );
}
if (!anonymous.owner.place || !anonymous.owner.place.label) {
  throw new Error('The binder "' + wanted + '" has no owner place in the signed-out answer.');
}

// Signed in as the seed collector: who owns it, for the flows' rows.
var signIn = http.post(
  emulator + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',
  {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: seedEmail, password: seedPassword, returnSecureToken: true }),
  }
);
if (!signIn.ok) {
  throw new Error('Emulator sign-in of ' + seedEmail + ' failed: HTTP ' + signIn.status);
}
var found = wantedBinder(
  http.get(listUrl, { headers: { Authorization: 'Bearer ' + json(signIn.body).idToken } }),
  'signed in'
);
if (!found.owner || !found.owner.handle) {
  throw new Error('The binder "' + wanted + '" has no owner handle for a member.');
}
if (!found.owner || !found.owner.place || !found.owner.place.label) {
  throw new Error('The binder "' + wanted + '" has no owner place in the answer.');
}
// The answer of the map never carries a city or a coordinate (ADR 0017).
var text = JSON.stringify(found);
if (/"(city|lat|lng|latitude|longitude|distance|radius)[A-Za-z]*"\s*:/.test(text)) {
  throw new Error('The binder list of ' + code + ' carries a city or a position: ' + text);
}

output.place = { region: region, code: code, count: count };
output.binder = {
  id: found.id,
  name: found.name,
  handle: found.owner.handle,
  owner: found.owner.displayName,
  place: found.owner.place.label,
};
