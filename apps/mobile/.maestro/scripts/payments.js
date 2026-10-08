// Maestro runScript (runs on the host): the seller of the payment-protection flow and the member
// of the Premium flow, driven through the local Firebase Auth emulator and the isolated mobile
// E2E API (:8090, database orenjitrade_mobile_e2e) with the local fake payment and billing
// providers (no card, no money). Only fresh, fictional `@mobile-e2e.test` accounts of this run are
// created or used; seed accounts are never touched.
//
// ACTION=setup creates Pia (the seller: payouts set up with the fake provider, a public binder
//   holding one PFT-002 Emberfang Fox for sale at 40 CAD that accepts offers) and Ada (the app
//   user, the buyer). Outputs: output.ada.{email, password, displayName},
//   output.pia.{email, password, displayName, handle, binderId, itemId}
// ACTION=accept accepts, as Pia (EMAIL / PASSWORD), the open protected offer on ITEM.
//   Output: output.trade.id
// ACTION=ship ships, as Pia, the paid trade of ITEM with a carrier and a tracking number.
// ACTION=expect-paid-out checks, as Pia, that the trade of ITEM is COMPLETED and its payout
//   released (PAYOUT_PENDING or PAID_OUT).
// ACTION=premium creates Pat (FREE) with five binders, the most the free plan allows.
//   Output: output.pat.{email, password, displayName}
// ACTION=expect-plan checks, as Pat (EMAIL / PASSWORD), that the plan is PLAN.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD, ITEM,
// PLAN.

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
    throw new Error('payments.js only acts as the run accounts (@mobile-e2e.test).');
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

/** 3 decimals, never ending in 0 (like a hand-picked centre). */
function pick(min, span) {
  var value = Math.round((min + Math.random() * span) * 1000);
  return (value % 10 === 0 ? value + 3 : value) / 1000;
}

/** A fresh onboarded collector; with `area`, discoverable around it. */
function createCollector(prefix, displayName, area) {
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
  if (area) {
    check(
      http.put(api + '/api/v1/me/location/trading-area', {
        headers: jsonHeaders(token),
        body: JSON.stringify({ lat: area.lat, lng: area.lng, radiusKm: 5, source: 'MANUAL' }),
      }),
      'PUT /me/location/trading-area'
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

/** The seller's trade of ITEM (most recent first). */
function tradeOfItem(token, itemId) {
  var trades = check(
    http.get(api + '/api/v1/trades?role=seller&limit=20', { headers: jsonHeaders(token) }),
    'GET /trades'
  );
  for (var t = 0; t < (trades.items || []).length; t++) {
    if (trades.items[t].item && trades.items[t].item.id === itemId) {
      return trades.items[t];
    }
  }
  throw new Error('No trade of ' + itemId + ' for the seller.');
}

if (action === 'setup') {
  var pia = createCollector('pia', 'Pia Maestro', { lat: pick(47.1, 1.3), lng: pick(-78.8, 7.8) });
  var ada = createCollector('ada', 'Ada Maestro', null);
  // Payouts with the fake provider: ready at once.
  var onboarding = check(
    http.post(api + '/api/v1/me/seller-account/onboarding', {
      headers: jsonHeaders(pia.token),
      body: '{}',
    }),
    'POST /me/seller-account/onboarding'
  );
  if (!onboarding.account.ready) {
    throw new Error('The fake payout account is not ready: ' + JSON.stringify(onboarding.account));
  }
  var binder = check(
    http.post(api + '/api/v1/binders', {
      headers: jsonHeaders(pia.token),
      body: JSON.stringify({
        name: 'Maestro payments binder',
        kind: 'TRADE',
        description: 'Fictional binder of the Maestro flows.',
      }),
    }),
    'POST /binders'
  );
  check(
    http.post(api + '/api/v1/binders/' + binder.id + '/publish', {
      headers: jsonHeaders(pia.token),
      body: JSON.stringify({ mode: 'UNTIL_DISABLED' }),
    }),
    'publish binder'
  );
  var item = check(
    http.post(api + '/api/v1/inventory/items', {
      headers: jsonHeaders(pia.token),
      body: JSON.stringify({
        printingId: printingId(pia.token, 'PFT-002'),
        binderId: binder.id,
        condition: 'NEAR_MINT',
        quantity: 1,
        availability: 'SALE',
        askingPrice: 40,
        currency: 'CAD',
        acceptsOffers: true,
        publicNotes: 'Fictional listing of the Maestro flows.',
      }),
    }),
    'POST /inventory/items'
  );
  output.ada = { email: ada.email, password: ada.password, displayName: ada.displayName };
  output.pia = {
    email: pia.email,
    password: pia.password,
    displayName: pia.displayName,
    handle: pia.handle,
    binderId: binder.id,
    itemId: item.id,
  };
} else if (action === 'accept') {
  var sellerToken = signIn(EMAIL, PASSWORD);
  var page = check(
    http.get(api + '/api/v1/offers?role=seller&status=OPEN&limit=20', {
      headers: jsonHeaders(sellerToken),
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
  var offer = check(
    http.get(api + '/api/v1/offers/' + open.id, { headers: jsonHeaders(sellerToken) }),
    'GET /offers/{id}'
  );
  if (!offer.protectionRequested) {
    throw new Error('The offer does not ask for payment protection.');
  }
  var accepted = check(
    http.post(api + '/api/v1/offers/' + open.id + '/accept', {
      headers: jsonHeaders(sellerToken),
      body: JSON.stringify({ version: offer.version }),
    }),
    'POST /offers/{id}/accept'
  );
  output.trade = { id: accepted.tradeId };
} else if (action === 'ship') {
  var shipperToken = signIn(EMAIL, PASSWORD);
  var paid = tradeOfItem(shipperToken, ITEM);
  if (paid.status !== 'PAID') {
    throw new Error('The trade is ' + paid.status + ', not PAID.');
  }
  check(
    http.post(api + '/api/v1/trades/' + paid.id + '/ship', {
      headers: jsonHeaders(shipperToken),
      body: JSON.stringify({ carrier: 'Canada Post', trackingNumber: 'MAESTRO-CP-001' }),
    }),
    'POST /trades/{id}/ship'
  );
} else if (action === 'expect-paid-out') {
  var ownerToken = signIn(EMAIL, PASSWORD);
  var done = check(
    http.get(api + '/api/v1/trades/' + tradeOfItem(ownerToken, ITEM).id, {
      headers: jsonHeaders(ownerToken),
    }),
    'GET /trades/{id}'
  );
  if (
    done.status !== 'COMPLETED' ||
    !done.payment ||
    (done.payment.status !== 'PAYOUT_PENDING' && done.payment.status !== 'PAID_OUT')
  ) {
    throw new Error(
      'Expected a completed trade with its payout released, got ' +
        done.status +
        ' / ' +
        (done.payment ? done.payment.status : 'no payment')
    );
  }
} else if (action === 'premium') {
  var pat = createCollector('pat', 'Pat Maestro', null);
  for (var b = 1; b <= 5; b++) {
    check(
      http.post(api + '/api/v1/binders', {
        headers: jsonHeaders(pat.token),
        body: JSON.stringify({ name: 'Maestro binder ' + b }),
      }),
      'POST /binders ' + b
    );
  }
  output.pat = { email: pat.email, password: pat.password, displayName: pat.displayName };
} else if (action === 'expect-plan') {
  var plan = check(
    http.get(api + '/api/v1/me/plan', { headers: jsonHeaders(signIn(EMAIL, PASSWORD)) }),
    'GET /me/plan'
  );
  if (!plan.plan || plan.plan.code !== PLAN) {
    throw new Error('Expected the ' + PLAN + ' plan, got ' + JSON.stringify(plan.plan));
  }
} else {
  throw new Error('Unknown ACTION ' + action);
}
