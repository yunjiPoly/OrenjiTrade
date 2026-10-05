// Maestro runScript (runs on the host): adds one card to a Maestro collector's inventory through
// the isolated API (:8090), the first printing of the first catalog hit for QUERY (the mock
// catalog of the isolated database; no card provider is ever called). Signs in through the local
// Auth emulator with the collector's own test credentials.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, QUERY.
// Outputs: output.item.{id, name}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('add-card.js only writes for the run accounts (@mobile-e2e.test).');
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
  http.get(api + '/api/v1/cards?query=' + encodeURIComponent(QUERY), { headers: auth }),
  'GET /cards'
);
if (!cards.items || cards.items.length === 0) {
  throw new Error('No card matches ' + QUERY + ' in the catalog.');
}
var card = check(http.get(api + '/api/v1/cards/' + cards.items[0].id, { headers: auth }), 'GET /cards/{id}');
var item = check(
  http.post(api + '/api/v1/inventory/items', {
    headers: auth,
    body: JSON.stringify({
      printingId: card.printings[0].id,
      quantity: 1,
      condition: 'NEAR_MINT',
      availability: 'TRADE',
    }),
  }),
  'POST /inventory/items'
);
output.item = { id: item.id, name: item.card.name };
