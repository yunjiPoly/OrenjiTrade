// Maestro runScript (runs on the host): gives a Maestro collector copies of one printing of the
// mock catalog through the isolated API (:8090), so an import can be seen adding to a card the
// collector already has. The printing is found by the card's name, its printing code and its
// edition (two printings can share a code); no card provider is ever called.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, CARD, CODE, EDITION, and optionally
// CONDITION (default NEAR_MINT) and QUANTITY (default 1).
// Outputs: output.owned.{id, name, quantity}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var condition = typeof CONDITION !== 'undefined' ? CONDITION : 'NEAR_MINT';
var quantity = typeof QUANTITY !== 'undefined' ? parseInt(QUANTITY, 10) : 1;

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('own-printing.js only writes for the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
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
var auth = { Authorization: 'Bearer ' + session.idToken, 'Content-Type': 'application/json' };

var cards = check(
  http.get(api + '/api/v1/cards?query=' + encodeURIComponent(CARD), { headers: auth }),
  'GET /cards'
);
var found = null;
for (var i = 0; i < (cards.items || []).length; i++) {
  if (cards.items[i].name === CARD) {
    found = cards.items[i];
  }
}
if (!found) {
  throw new Error('No card named ' + CARD + ' in the catalog.');
}
var card = check(http.get(api + '/api/v1/cards/' + found.id, { headers: auth }), 'GET /cards/{id}');
var printing = null;
for (var p = 0; p < card.printings.length; p++) {
  if (card.printings[p].printingCode === CODE && card.printings[p].edition === EDITION) {
    printing = card.printings[p];
  }
}
if (!printing) {
  throw new Error('No printing ' + CODE + ' ' + EDITION + ' of ' + CARD + '.');
}
var item = check(
  http.post(api + '/api/v1/inventory/items', {
    headers: auth,
    body: JSON.stringify({
      printingId: printing.id,
      quantity: quantity,
      condition: condition,
    }),
  }),
  'POST /inventory/items'
);
output.owned = { id: item.id, name: item.card.name, quantity: item.quantity };
