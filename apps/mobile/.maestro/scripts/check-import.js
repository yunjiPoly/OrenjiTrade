// Maestro runScript (runs on the host): checks what the isolated API (:8090) holds for a Maestro
// collector after an inventory import. Signs in through the local Auth emulator with the
// collector's own test credentials and reads GET /api/v1/inventory/items and
// GET /api/v1/inventory/imports.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, EXPECT_ITEMS (what the inventory
// holds, sorted: "CODE:CONDITION:QUANTITY:VISIBILITY" joined by commas; '' for an empty
// inventory), and optionally EXPECT_IMPORT_STATUS (the status of the newest import, or 'NONE').
// Outputs: output.imported.{count}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-import.js only reads the run accounts (@mobile-e2e.test).');
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
var auth = { Authorization: 'Bearer ' + session.idToken };
var page = check(
  http.get(api + '/api/v1/inventory/items?size=50', { headers: auth }),
  'GET /inventory/items'
);
var held = [];
var items = page.items || [];
for (var i = 0; i < items.length; i++) {
  held.push(
    items[i].printing.printingCode +
      ':' +
      items[i].condition +
      ':' +
      items[i].quantity +
      ':' +
      items[i].visibility
  );
}
held.sort();
var actual = held.join(',');
if (actual !== EXPECT_ITEMS) {
  throw new Error('Expected the inventory ' + EXPECT_ITEMS + ', got ' + actual + '.');
}

if (typeof EXPECT_IMPORT_STATUS !== 'undefined') {
  var imports = check(
    http.get(api + '/api/v1/inventory/imports', { headers: auth }),
    'GET /inventory/imports'
  );
  var status = imports.length > 0 ? imports[0].status : 'NONE';
  if (status !== EXPECT_IMPORT_STATUS) {
    throw new Error('Expected the newest import ' + EXPECT_IMPORT_STATUS + ', got ' + status + '.');
  }
}
output.imported = { count: items.length };
