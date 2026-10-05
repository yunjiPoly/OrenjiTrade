// Maestro runScript (runs on the host): checks what the isolated API (:8090) holds for a Maestro
// collector after a flow changed their inventory or binders. Signs in through the local Auth
// emulator with the collector's own test credentials and reads GET /api/v1/inventory/items (and
// GET /api/v1/binders when a binder is expected).
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, EXPECT_COUNT, and optionally
// EXPECT_QUANTITY, EXPECT_AVAILABILITY, EXPECT_FINISH (of the only item), EXPECT_BINDER (its
// binder's name) and EXPECT_BINDER_VISIBILITY (that binder's visibility).
// Outputs: output.inventory.{count}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-inventory.js only reads the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status);
  }
  return json(response.body);
}

function expectEqual(actual, expected, what) {
  if (typeof expected !== 'undefined' && String(actual) !== String(expected)) {
    throw new Error('Expected ' + what + ' ' + expected + ', got ' + actual + '.');
  }
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
var items = page.items || [];
expectEqual(items.length, EXPECT_COUNT, 'item count');

if (items.length === 1) {
  var item = items[0];
  expectEqual(item.quantity, typeof EXPECT_QUANTITY !== 'undefined' ? EXPECT_QUANTITY : undefined, 'quantity');
  expectEqual(
    item.availability,
    typeof EXPECT_AVAILABILITY !== 'undefined' ? EXPECT_AVAILABILITY : undefined,
    'availability'
  );
  expectEqual(item.finish, typeof EXPECT_FINISH !== 'undefined' ? EXPECT_FINISH : undefined, 'finish');
  if (typeof EXPECT_BINDER !== 'undefined') {
    expectEqual(item.binder ? item.binder.name : '(none)', EXPECT_BINDER, 'binder');
    var binders = check(http.get(api + '/api/v1/binders', { headers: auth }), 'GET /binders');
    var binder = null;
    for (var i = 0; i < binders.length; i++) {
      if (binders[i].name === EXPECT_BINDER) {
        binder = binders[i];
      }
    }
    if (!binder) {
      throw new Error('No binder named ' + EXPECT_BINDER + '.');
    }
    expectEqual(
      binder.visibility,
      typeof EXPECT_BINDER_VISIBILITY !== 'undefined' ? EXPECT_BINDER_VISIBILITY : undefined,
      'binder visibility'
    );
  }
}
output.inventory = { count: items.length };
