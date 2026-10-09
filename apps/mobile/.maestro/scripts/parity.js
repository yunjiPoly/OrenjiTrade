// Maestro runScript (runs on the host): the data of the stage M7 flows, through the local
// Firebase Auth emulator and the isolated mobile E2E API (:8090, database orenjitrade_mobile_e2e),
// like the Playwright specs' API helpers. Only fresh, fictional `@mobile-e2e.test` accounts of
// this run are created or used; seed accounts are never touched. Collectors declare a place
// (ADR 0017: country and state or province, no coordinate): the app user in Quebec, the other
// collector in Wyoming, both in the platform region Americas (North).
//
// ACTION=looking-for creates Wren (the app user, discoverable) and Hal (in Wyoming,
//   discoverable, name search allowed, "Let others see what you want" on, one Emberfang Fox
//   wish with a private price).
//   Outputs: output.wren.{email, password, displayName}, output.hal.{handle, displayName},
//            output.card.{id, name}
// ACTION=holders creates Ada (the app user) and Ben (in Wyoming, discoverable, a public
//   binder with two PFT-002 copies: Near Mint for trade or sale at 45 CAD accepting offers, and
//   Lightly Played for sale at 20 CAD not accepting offers).
//   Outputs: output.ada.{email, password, displayName}, output.ben.{handle, displayName},
//            output.card.{id, name}, output.items.{offers, cheap}
// ACTION=expect-blocks checks, as EMAIL / PASSWORD, that `GET /me/blocks` holds EXPECT_COUNT
//   collectors (HANDLE among them when given).
// ACTION=verify-email marks the e-mail of EMAIL / PASSWORD as verified in the emulator (a
//   verification code requested, then applied; no e-mail is ever sent locally): Firebase then
//   keeps the password when Google signs in with the same e-mail instead of replacing it.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD,
// EXPECT_COUNT, HANDLE.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'rmanual0';
var action = typeof ACTION !== 'undefined' ? ACTION : 'looking-for';

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
    throw new Error('parity.js only acts as the run accounts (@mobile-e2e.test).');
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

var QUEBEC = { countryCode: 'CA', subdivisionCode: 'CA-QC' };
var WYOMING = { countryCode: 'US', subdivisionCode: 'US-WY' };

/** A fresh onboarded collector with a declared place; `privacy` merges into the settings. */
function createCollector(prefix, displayName, place, privacy) {
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
  var settings = check(
    http.get(api + '/api/v1/me/settings/privacy', { headers: jsonHeaders(token) }),
    'GET privacy'
  );
  settings.discoverable = true;
  for (var key in privacy || {}) {
    settings[key] = privacy[key];
  }
  check(
    http.put(api + '/api/v1/me/settings/privacy', {
      headers: jsonHeaders(token),
      body: JSON.stringify(settings),
    }),
    'PUT privacy'
  );
  return {
    email: email,
    password: password,
    displayName: displayName,
    handle: handle,
    token: token,
  };
}

/** The card and printing ids of a seed printing code (`PFT-002`). */
function printingOf(token, code) {
  var suggestions = check(
    http.get(api + '/api/v1/cards/suggest?q=' + code + '&limit=10', {
      headers: jsonHeaders(token),
    }),
    'suggest'
  );
  for (var j = 0; j < suggestions.length; j++) {
    if (suggestions[j].kind === 'PRINTING' && suggestions[j].printingCode === code) {
      return {
        cardId: suggestions[j].id,
        printingId: suggestions[j].printingId,
        cardName: suggestions[j].name,
      };
    }
  }
  throw new Error(code + ' is not in the seed catalog.');
}

if (action === 'looking-for') {
  var wren = createCollector('wren', 'Wren Maestro', QUEBEC, null);
  var hal = createCollector('hal', 'Hal Maestro', WYOMING, {
    searchDiscoverable: true,
    wishlistVisible: true,
  });
  var wanted = printingOf(hal.token, 'PFT-002');
  check(
    http.post(api + '/api/v1/wishlist', {
      headers: jsonHeaders(hal.token),
      body: JSON.stringify({
        cardId: wanted.cardId,
        note: 'Fictional Maestro wish.',
        nearMintOnly: true,
        priceTerm: '85% TCG',
      }),
    }),
    'POST /wishlist'
  );
  output.wren = { email: wren.email, password: wren.password, displayName: wren.displayName };
  output.hal = { handle: hal.handle, displayName: hal.displayName };
  output.card = { id: wanted.cardId, name: wanted.cardName };
} else if (action === 'holders') {
  var ada = createCollector('ada', 'Ada Maestro', QUEBEC, null);
  var ben = createCollector('ben', 'Ben Maestro', WYOMING, null);
  var listed = printingOf(ben.token, 'PFT-002');
  var binder = check(
    http.post(api + '/api/v1/binders', {
      headers: jsonHeaders(ben.token),
      body: JSON.stringify({
        name: 'Maestro holders binder',
        kind: 'TRADE',
        description: 'Fictional binder of the Maestro flows.',
      }),
    }),
    'POST /binders'
  );
  check(
    http.post(api + '/api/v1/binders/' + binder.id + '/publish', {
      headers: jsonHeaders(ben.token),
      body: JSON.stringify({ mode: 'UNTIL_DISABLED' }),
    }),
    'publish binder'
  );
  function listCopy(condition, availability, price, acceptsOffers) {
    return check(
      http.post(api + '/api/v1/inventory/items', {
        headers: jsonHeaders(ben.token),
        body: JSON.stringify({
          printingId: listed.printingId,
          binderId: binder.id,
          condition: condition,
          availability: availability,
          askingPrice: price,
          currency: 'CAD',
          acceptsOffers: acceptsOffers,
          publicNotes: 'Fictional listing of the Maestro flows.',
        }),
      }),
      'POST /inventory/items'
    ).id;
  }
  output.ada = { email: ada.email, password: ada.password, displayName: ada.displayName };
  output.ben = { handle: ben.handle, displayName: ben.displayName };
  output.card = { id: listed.cardId, name: listed.cardName };
  output.items = {
    offers: listCopy('NEAR_MINT', 'TRADE_OR_SALE', 45, true),
    cheap: listCopy('LIGHTLY_PLAYED', 'SALE', 20, false),
  };
} else if (action === 'expect-blocks') {
  var blocks = check(
    http.get(api + '/api/v1/me/blocks', { headers: jsonHeaders(signIn(EMAIL, PASSWORD)) }),
    'GET /me/blocks'
  );
  var expected = Number(EXPECT_COUNT);
  if (blocks.length !== expected) {
    throw new Error('Expected ' + expected + ' blocked collectors, got ' + JSON.stringify(blocks));
  }
  if (typeof HANDLE !== 'undefined' && expected > 0) {
    var found = false;
    for (var b = 0; b < blocks.length; b++) {
      if (blocks[b].handle === HANDLE) {
        found = true;
      }
    }
    if (!found) {
      throw new Error(HANDLE + ' is not among the blocks: ' + JSON.stringify(blocks));
    }
  }
} else if (action === 'verify-email') {
  var idToken = signIn(EMAIL, PASSWORD);
  check(
    http.post(
      emulator + '/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-local-key',
      {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken: idToken }),
      }
    ),
    'emulator sendOobCode'
  );
  var codes =
    check(
      http.get(emulator + '/emulator/v1/projects/orenjitrade-local/oobCodes'),
      'emulator oobCodes'
    ).oobCodes || [];
  var code = null;
  for (var c = 0; c < codes.length; c++) {
    if (codes[c].email === EMAIL && codes[c].requestType === 'VERIFY_EMAIL') {
      code = codes[c].oobCode;
    }
  }
  if (!code) {
    throw new Error('No verification code for ' + EMAIL);
  }
  check(
    http.post(emulator + '/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-local-key', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oobCode: code }),
    }),
    'apply the verification code'
  );
} else {
  throw new Error('Unknown ACTION ' + action);
}
