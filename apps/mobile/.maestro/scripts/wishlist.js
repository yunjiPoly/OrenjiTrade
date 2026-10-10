// Maestro runScript (runs on the host): the two collectors of the wishlist flow, through the
// local Firebase Auth emulator and the isolated mobile E2E API (:8090). Both are fresh, fictional
// `@mobile-e2e.test` accounts of this run, both in Montevideo (Americas (South), ADR 0017: wishlist
// alerts stay in a platform region; no other flow or spec uses that region, so listings of other
// flows never alert).
//
// ACTION=setup creates Wren (the app user: a location, discoverable) and Hal (in the same region,
//   discoverable, with a public binder).
//   Outputs: output.wren.{email, password, displayName}, output.hal.{email, password,
//            displayName, binderId}
// ACTION=list lists one public Near Mint copy of PFT-002 (Emberfang Fox) in Hal's binder (EMAIL /
//   PASSWORD = Hal's, BINDER): Wren then gets a wishlist alert.
// ACTION=expect-wish checks, as Wren, that the wishlist holds one Emberfang Fox wish with the
//   stage S2 fields (public note, Near Mint only, "85% TCG") and none of the removed ones.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD,
// BINDER.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'rmanual0';
var action = typeof ACTION !== 'undefined' ? ACTION : 'setup';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
  }
  return response.body ? json(response.body) : null;
}

function jsonHeaders(token) {
  return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}

/** Records the 18+ confirmation (`AGE_CONFIRMATION`, its current version) for the account. */
function confirmAge(token) {
  var documents = check(
    http.get(api + '/api/v1/public/legal/documents', { headers: jsonHeaders(token) }),
    'GET /public/legal/documents'
  );
  for (var d = 0; d < documents.length; d++) {
    if (documents[d].documentType === 'AGE_CONFIRMATION') {
      check(
        http.post(api + '/api/v1/me/consents', {
          headers: jsonHeaders(token),
          body: JSON.stringify({
            documentType: documents[d].documentType,
            version: documents[d].version,
          }),
        }),
        'POST /me/consents (AGE_CONFIRMATION)'
      );
    }
  }
}

function signIn(email, password) {
  if (!/@mobile-e2e\.test$/.test(email)) {
    throw new Error('wishlist.js only acts as the run accounts (@mobile-e2e.test).');
  }
  return check(
    http.post(
      emulator +
        '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
      }
    ),
    'emulator sign-in'
  ).idToken;
}

var MONTEVIDEO = { countryCode: 'UY', subdivisionCode: 'UY-MO' };

function createCollector(prefix, displayName, place) {
  var suffix = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  var email = 'm-' + runId + '-maestro-' + prefix + '-' + suffix + '@mobile-e2e.test';
  var password = 'Maestro-Pass-42';
  var handle = ('m' + prefix + '_' + suffix)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
  var token = check(
    http.post(emulator + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-key', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
    }),
    'emulator sign-up'
  ).idToken;
  var me = check(http.get(api + '/api/v1/me', { headers: jsonHeaders(token) }), 'GET /me');
  for (var i = 0; i < me.requiredConsents.length; i++) {
    check(
      http.post(api + '/api/v1/me/consents', {
        headers: jsonHeaders(token),
        body: JSON.stringify(me.requiredConsents[i]),
      }),
      'POST /me/consents'
    );
  }
  // The 18+ confirmation (launch readiness): the current AGE_CONFIRMATION version, like the app.
  confirmAge(token);
  check(
    http.put(api + '/api/v1/me/profile', {
      headers: jsonHeaders(token),
      body: JSON.stringify({
        handle: handle,
        displayName: displayName,
        bio: 'Maestro bio.',
        games: ['pokemon'],
        languages: ['en'],
      }),
    }),
    'PUT /me/profile'
  );
  check(
    http.put(api + '/api/v1/me/location', {
      headers: jsonHeaders(token),
      body: JSON.stringify({
        countryCode: place.countryCode,
        subdivisionCode: place.subdivisionCode,
        city: null,
        showCity: true,
      }),
    }),
    'PUT /me/location'
  );
  var privacy = check(
    http.get(api + '/api/v1/me/settings/privacy', { headers: jsonHeaders(token) }),
    'GET privacy'
  );
  privacy.discoverable = true;
  check(
    http.put(api + '/api/v1/me/settings/privacy', {
      headers: jsonHeaders(token),
      body: JSON.stringify(privacy),
    }),
    'PUT privacy'
  );
  return { email: email, password: password, displayName: displayName, token: token };
}

if (action === 'setup') {
  var wren = createCollector('wren', 'Wren Maestro', MONTEVIDEO);
  var hal = createCollector('hal', 'Hal Maestro', MONTEVIDEO);
  var binder = check(
    http.post(api + '/api/v1/binders', {
      headers: jsonHeaders(hal.token),
      body: JSON.stringify({
        name: 'Maestro wish binder',
        kind: 'TRADE',
        description: 'Fictional binder of the Maestro flows.',
      }),
    }),
    'POST /binders'
  );
  check(
    http.post(api + '/api/v1/binders/' + binder.id + '/publish', {
      headers: jsonHeaders(hal.token),
      body: JSON.stringify({ mode: 'UNTIL_DISABLED' }),
    }),
    'publish binder'
  );
  output.wren = { email: wren.email, password: wren.password, displayName: wren.displayName };
  output.hal = {
    email: hal.email,
    password: hal.password,
    displayName: hal.displayName,
    binderId: binder.id,
  };
} else if (action === 'list') {
  var token = signIn(EMAIL, PASSWORD);
  var suggestions = check(
    http.get(api + '/api/v1/cards/suggest?q=PFT-002&limit=10', { headers: jsonHeaders(token) }),
    'suggest'
  );
  var printingId = null;
  for (var j = 0; j < suggestions.length; j++) {
    if (suggestions[j].kind === 'PRINTING' && suggestions[j].printingCode === 'PFT-002') {
      printingId = printingId || suggestions[j].printingId;
    }
  }
  if (!printingId) {
    throw new Error('PFT-002 is not in the seed catalog.');
  }
  check(
    http.post(api + '/api/v1/inventory/items', {
      headers: jsonHeaders(token),
      body: JSON.stringify({
        printingId: printingId,
        binderId: BINDER,
        condition: 'NEAR_MINT',
        availability: 'TRADE_OR_SALE',
        askingPrice: 12,
        currency: 'CAD',
        acceptsOffers: false,
        publicNotes: 'Fictional listing of the Maestro flows.',
      }),
    }),
    'POST /inventory/items'
  );
} else if (action === 'expect-wish') {
  var wishes = check(
    http.get(api + '/api/v1/wishlist', { headers: jsonHeaders(signIn(EMAIL, PASSWORD)) }),
    'GET /wishlist'
  );
  if (wishes.length !== 1 || !wishes[0].card || wishes[0].card.name !== 'Emberfang Fox') {
    throw new Error('Expected one Emberfang Fox wish, got ' + wishes.length + '.');
  }
  var wished = wishes[0];
  if (
    wished.note !== 'Fictional Maestro wish.' ||
    wished.nearMintOnly !== true ||
    !wished.priceTerm ||
    wished.priceTerm.label !== '85% TCG'
  ) {
    throw new Error(
      'The wish lacks its note, Near Mint only or price term: ' + JSON.stringify(wished)
    );
  }
  var removed = [
    'radiusKm',
    'maxPrice',
    'currency',
    'tradePreference',
    'notes',
    'active',
    'matchCount',
  ];
  for (var r = 0; r < removed.length; r++) {
    if (removed[r] in wished) {
      throw new Error('A wish still carries ' + removed[r] + ' (removed in stage S2).');
    }
  }
} else {
  throw new Error('Unknown ACTION ' + action);
}
