// Maestro runScript (runs on the host): the second collector of the offer, trade and report
// flows, driven through the local Firebase Auth emulator and the isolated mobile E2E API (:8090,
// database orenjitrade_mobile_e2e), like the Playwright specs' API helpers. Only fresh, fictional
// `@mobile-e2e.test` accounts of this run are created or used; seed accounts are never touched.
//
// ACTION=setup creates Ben (the seller: in Wyoming, discoverable, a public binder holding one
//   PFT-002 Emberfang Fox for trade or sale at 45 CAD that accepts offers) and Ada (the app user,
//   the buyer).
//   Outputs: output.ada.{email, password, displayName},
//            output.ben.{email, password, displayName, handle, binderId, itemId}
// ACTION=counter answers, as Ben (EMAIL / PASSWORD), the open offer on ITEM with a 42 CAD
//   counter-offer. Output: output.counter.id
// ACTION=complete confirms, as Ben, the exchange of the trade of ITEM (completes it once Ada
//   confirmed too).
// ACTION=expect-rating checks, as Ada (EMAIL / PASSWORD), that Ben (HANDLE) holds her rating with
//   EXPECT_OVERALL stars.
// ACTION=reporting creates Ada (the reporter, the app user) and Bo (the reported collector).
//   Outputs: output.ada.{email, password, displayName}, output.bo.{handle, displayName}
// ACTION=expect-report checks, as Ada, that she has one OPEN report against HANDLE with REASON.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD, ITEM,
// HANDLE, EXPECT_OVERALL, REASON.

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
    throw new Error('offers.js only acts as the run accounts (@mobile-e2e.test).');
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

/** The seller's declared place (ADR 0017: a state, never a coordinate). */
var WYOMING = { countryCode: 'US', subdivisionCode: 'US-WY' };

/** A fresh onboarded collector; with `place` (country and state), discoverable there. */
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
  if (place) {
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
  }
  return {
    email: email,
    password: password,
    displayName: displayName,
    handle: handle,
    token: token,
  };
}

function printingId(token, code) {
  var suggestions = check(
    http.get(api + '/api/v1/cards/suggest?q=' + code + '&limit=10', {
      headers: jsonHeaders(token),
    }),
    'suggest'
  );
  for (var j = 0; j < suggestions.length; j++) {
    if (suggestions[j].kind === 'PRINTING' && suggestions[j].printingCode === code) {
      return suggestions[j].printingId;
    }
  }
  throw new Error(code + ' is not in the seed catalog.');
}

if (action === 'setup') {
  var ben = createCollector('ben', 'Ben Maestro', WYOMING);
  var ada = createCollector('ada', 'Ada Maestro', null);
  var binder = check(
    http.post(api + '/api/v1/binders', {
      headers: jsonHeaders(ben.token),
      body: JSON.stringify({
        name: 'Maestro offers binder',
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
  var item = check(
    http.post(api + '/api/v1/inventory/items', {
      headers: jsonHeaders(ben.token),
      body: JSON.stringify({
        printingId: printingId(ben.token, 'PFT-002'),
        binderId: binder.id,
        condition: 'NEAR_MINT',
        quantity: 2,
        availability: 'TRADE_OR_SALE',
        askingPrice: 45,
        currency: 'CAD',
        acceptsOffers: true,
        publicNotes: 'Fictional listing of the Maestro flows.',
      }),
    }),
    'POST /inventory/items'
  );
  output.ada = { email: ada.email, password: ada.password, displayName: ada.displayName };
  output.ben = {
    email: ben.email,
    password: ben.password,
    displayName: ben.displayName,
    handle: ben.handle,
    binderId: binder.id,
    itemId: item.id,
  };
} else if (action === 'counter') {
  var token = signIn(EMAIL, PASSWORD);
  var page = check(
    http.get(api + '/api/v1/offers?role=seller&status=OPEN&limit=20', {
      headers: jsonHeaders(token),
    }),
    'GET /offers'
  );
  var open = null;
  for (var k = 0; k < (page.items || []).length; k++) {
    if (page.items[k].item && page.items[k].item.id === ITEM && page.items[k].yourTurn) {
      open = page.items[k];
    }
  }
  if (!open) {
    throw new Error('No open offer on ' + ITEM + ' waits for the seller.');
  }
  var counter = check(
    http.post(api + '/api/v1/offers/' + open.id + '/counter', {
      headers: jsonHeaders(token),
      body: JSON.stringify({
        kind: 'CASH',
        cashAmount: 42,
        currency: 'CAD',
        tradeItemIds: [],
        message: 'Meet me halfway?',
        version: open.version,
      }),
    }),
    'POST /offers/{id}/counter'
  );
  output.counter = { id: counter.id };
} else if (action === 'complete') {
  var sellerToken = signIn(EMAIL, PASSWORD);
  var trades = check(
    http.get(api + '/api/v1/trades?role=seller&limit=20', { headers: jsonHeaders(sellerToken) }),
    'GET /trades'
  );
  var trade = null;
  for (var t = 0; t < (trades.items || []).length; t++) {
    if (trades.items[t].item && trades.items[t].item.id === ITEM) {
      trade = trades.items[t];
    }
  }
  if (!trade) {
    throw new Error('No trade of ' + ITEM + ' for the seller.');
  }
  var completed = check(
    // Maestro's http.post needs a body; the endpoint reads none.
    http.post(api + '/api/v1/trades/' + trade.id + '/complete', {
      headers: jsonHeaders(sellerToken),
      body: '{}',
    }),
    'POST /trades/{id}/complete'
  );
  if (completed.status !== 'COMPLETED') {
    throw new Error('The trade is ' + completed.status + ', not COMPLETED.');
  }
} else if (action === 'expect-rating') {
  var ratings = check(
    http.get(api + '/api/v1/collectors/' + HANDLE + '/ratings', {
      headers: jsonHeaders(signIn(EMAIL, PASSWORD)),
    }),
    'GET ratings'
  );
  var items = ratings.items || [];
  if (items.length !== 1 || String(items[0].overall) !== String(EXPECT_OVERALL)) {
    throw new Error(
      'Expected one ' + EXPECT_OVERALL + '-star rating, got ' + JSON.stringify(items)
    );
  }
} else if (action === 'reporting') {
  var reporter = createCollector('ada', 'Ada Reporter', null);
  var reported = createCollector('bo', 'Bo Reported', null);
  output.ada = {
    email: reporter.email,
    password: reporter.password,
    displayName: reporter.displayName,
  };
  output.bo = { handle: reported.handle, displayName: reported.displayName };
} else if (action === 'expect-report') {
  var reports = check(
    http.get(api + '/api/v1/me/reports', { headers: jsonHeaders(signIn(EMAIL, PASSWORD)) }),
    'GET /me/reports'
  );
  if (
    reports.length !== 1 ||
    reports[0].status !== 'OPEN' ||
    reports[0].reason !== REASON ||
    reports[0].reportedUser.handle !== HANDLE
  ) {
    throw new Error('Expected one open ' + REASON + ' report, got ' + JSON.stringify(reports));
  }
} else {
  throw new Error('Unknown ACTION ' + action);
}
