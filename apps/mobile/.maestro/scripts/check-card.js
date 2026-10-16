// Maestro runScript (runs on the host): checks one card of a Maestro collector's inventory as the
// isolated API (:8090) holds it after a flow: its binder and the visibility its collector gave it
// (stage R3, review fix 1: a card picked into a deck core, taken out of it or left by a deleted
// deck core keeps its own visibility; buyers see the core's cards as its key cards only), and,
// when asked, that a binder is gone. Signs in through the local Auth emulator with the
// collector's own test credentials; writes nothing.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, ITEM_ID (the card, as add-card.js
// made it), EXPECT_BINDER (the binder's name, or 'none' for an unfiled card), EXPECT_VISIBILITY
// (PRIVATE | PUBLIC), GONE_BINDER (a binder name the collector no longer has). Every input but
// EMAIL, PASSWORD and ITEM_ID is optional.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-card.js only reads the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
  }
  return json(response.body);
}

function expectEqual(what, actual, expected) {
  if (String(actual) !== String(expected)) {
    throw new Error(what + ': expected ' + expected + ', the API holds ' + actual);
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

var item = check(
  http.get(api + '/api/v1/inventory/items/' + ITEM_ID, { headers: auth }),
  'GET /inventory/items/{id}'
);
if (typeof EXPECT_BINDER !== 'undefined') {
  expectEqual('the binder', item.binder ? item.binder.name : 'none', EXPECT_BINDER);
}
if (typeof EXPECT_VISIBILITY !== 'undefined') {
  expectEqual('visibility', item.visibility, EXPECT_VISIBILITY);
}
if (typeof GONE_BINDER !== 'undefined') {
  var binders = check(http.get(api + '/api/v1/binders', { headers: auth }), 'GET /binders');
  for (var i = 0; i < binders.length; i++) {
    if (binders[i].name === GONE_BINDER) {
      throw new Error('The binder ' + GONE_BINDER + ' is still there.');
    }
  }
}
