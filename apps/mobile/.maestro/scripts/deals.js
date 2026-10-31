// Maestro runScript (runs on the host): the other collector of the deal flows of stage R4 (Messages
// and Mark as sold), driven through the local Firebase Auth emulator and the isolated mobile E2E
// API (:8090, database orenjitrade_mobile_e2e), like the Playwright specs' API helpers. Only
// `@mobile-e2e.test` accounts of this run are created or used; seed accounts are never touched; the
// catalog is the mock catalog of the isolated database (no card provider is ever called).
//
// ACTION=seller-setup (native flow 4): Ada (the app user, Quebec, discoverable) lists one copy of
//   QUERY at "$32" in a public binder; Ben (Ontario, discoverable) opens the chat about that card
//   (it becomes the chat's pinned subject) and asks "Is it still available?".
//   Outputs: output.ada.{email, password, handle}, output.ben.{email, password, handle},
//            output.conversation.id, output.card.{itemId, name}
// ACTION=buyer-setup (native flow 3, as far as stage R4 reaches): Ben (Ontario, discoverable) sells
//   a public deck core "Maestro Moth core" at "$95" with one card of QUERY; Ada (the app user,
//   Quebec) will open its page and message Ben. Outputs: output.ada, output.ben,
//   output.core.{id, name}
// ACTION=buyer-card-setup (the walks of stage R4 and, with stage R5, flow 3): Ben (Ontario,
//   discoverable) lists one copy of QUERY at "$32" in a public binder; Ada (the app user, Quebec)
//   opens the chat about it through the API, as "Message" on a holder row will (stage R5), and the
//   two exchange a few lines. Outputs: output.ada, output.ben, output.conversation.id,
//   output.card.{itemId, name}
// ACTION=mark-sold marks, as Ben (EMAIL / PASSWORD), the subject of CONVERSATION sold, with
//   TRACKING when given (the other side of the buyer's walk).
// ACTION=expect-body checks, as Ben (EMAIL / PASSWORD), that CONVERSATION holds a message whose
//   body is EXPECT_BODY (what Ada sent from the app).
// ACTION=expect-sales checks, as Ben, that CONVERSATION shows EXPECT_SALES sale messages (0 after
//   an undo), with EXPECT_TRACKING on the newest, and that Ben holds EXPECT_SALES "sold to you"
//   notifications (the undo withdraws it).
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, QUERY, and per action EMAIL,
// PASSWORD, CONVERSATION, TRACKING, EXPECT_BODY, EXPECT_SALES, EXPECT_TRACKING.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'rmanual0';
var action = typeof ACTION !== 'undefined' ? ACTION : 'seller-setup';
var query = typeof QUERY !== 'undefined' ? QUERY : 'Lantern Fox Spirit';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
  }
  return response.body ? json(response.body) : null;
}

function headers(token) {
  return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
}

function signIn(email, password) {
  if (!/@mobile-e2e\.test$/.test(email)) {
    throw new Error('deals.js only acts as the run accounts (@mobile-e2e.test).');
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

/** A fresh, fictional collector: terms, 18+, a profile, a place and "Show me on the map". */
function createCollector(prefix, displayName, country, subdivision) {
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
  var me = check(http.get(api + '/api/v1/me', { headers: headers(token) }), 'GET /me');
  for (var i = 0; i < me.requiredConsents.length; i++) {
    check(
      http.post(api + '/api/v1/me/consents', {
        headers: headers(token),
        body: JSON.stringify(me.requiredConsents[i]),
      }),
      'POST /me/consents'
    );
  }
  var documents = check(
    http.get(api + '/api/v1/public/legal/documents', { headers: headers(token) }),
    'GET /public/legal/documents'
  );
  for (var d = 0; d < documents.length; d++) {
    if (documents[d].documentType === 'AGE_CONFIRMATION') {
      check(
        http.post(api + '/api/v1/me/consents', {
          headers: headers(token),
          body: JSON.stringify({
            documentType: documents[d].documentType,
            version: documents[d].version,
          }),
        }),
        'POST /me/consents (AGE_CONFIRMATION)'
      );
    }
  }
  check(
    http.put(api + '/api/v1/me/profile', {
      headers: headers(token),
      body: JSON.stringify({
        handle: handle,
        displayName: displayName,
        bio: 'Maestro deals.',
        games: ['pokemon'],
        languages: ['en'],
      }),
    }),
    'PUT /me/profile'
  );
  check(
    http.put(api + '/api/v1/me/location', {
      headers: headers(token),
      body: JSON.stringify({
        countryCode: country,
        subdivisionCode: subdivision,
        city: null,
        showCity: false,
      }),
    }),
    'PUT /me/location'
  );
  var settings = check(
    http.get(api + '/api/v1/me/settings/privacy', { headers: headers(token) }),
    'GET privacy'
  );
  settings.discoverable = true;
  check(
    http.put(api + '/api/v1/me/settings/privacy', {
      headers: headers(token),
      body: JSON.stringify(settings),
    }),
    'PUT privacy'
  );
  return { email: email, password: password, handle: handle, id: me.id, token: token };
}

/** The first printing of the first catalog hit for `text`. */
function printingOf(token, text) {
  var cards = check(
    http.get(api + '/api/v1/cards?query=' + encodeURIComponent(text), {
      headers: headers(token),
    }),
    'GET /cards'
  );
  if (!cards.items || cards.items.length === 0) {
    throw new Error('No catalog card for ' + text);
  }
  var card = check(
    http.get(api + '/api/v1/cards/' + cards.items[0].id, { headers: headers(token) }),
    'GET /cards/{id}'
  );
  return { printingId: card.printings[0].id, name: card.name, game: card.game };
}

/**
 * The id of a game by its slug (`GET /games`, public): a binder holds the cards of one game (stage
 * G), so the binders made here name the game of the cards they take.
 */
function gameIdOf(slug) {
  var response = http.get(api + '/api/v1/games');
  if (!response.ok) {
    throw new Error('GET /games failed: HTTP ' + response.status);
  }
  var games = json(response.body);
  for (var g = 0; g < games.length; g++) {
    if (games[g].slug === slug) {
      return games[g].id;
    }
  }
  throw new Error('No game ' + slug);
}

function account(collector) {
  return { email: collector.email, password: collector.password, handle: collector.handle };
}

if (action === 'seller-setup') {
  var ada = createCollector('dsell', 'Ada Seller', 'CA', 'CA-QC');
  var ben = createCollector('dbuy', 'Ben Buyer', 'CA', 'CA-ON');
  var printing = printingOf(ada.token, query);
  var binder = check(
    http.post(api + '/api/v1/binders', {
      headers: headers(ada.token),
      body: JSON.stringify({
        name: 'Deals binder',
        visibility: 'PUBLIC',
        gameId: gameIdOf(printing.game),
      }),
    }),
    'POST /binders'
  );
  var item = check(
    http.post(api + '/api/v1/inventory/items', {
      headers: headers(ada.token),
      body: JSON.stringify({
        printingId: printing.printingId,
        binderId: binder.id,
        visibility: 'PUBLIC',
        quantity: 1,
        askingPriceText: '$32',
      }),
    }),
    'POST /inventory/items'
  );
  var conversation = check(
    http.post(api + '/api/v1/conversations', {
      headers: headers(ben.token),
      body: JSON.stringify({ recipientId: ada.id, subjectItemId: item.id }),
    }),
    'POST /conversations (about the card)'
  );
  check(
    http.post(api + '/api/v1/conversations/' + conversation.id + '/messages', {
      headers: headers(ben.token),
      body: JSON.stringify({ kind: 'TEXT', body: 'Is it still available?' }),
    }),
    'POST message'
  );
  output.ada = account(ada);
  output.ben = account(ben);
  output.conversation = { id: conversation.id };
  output.card = { itemId: item.id, name: printing.name };
} else if (action === 'buyer-setup') {
  var buyer = createCollector('dbuy3', 'Ada Buyer', 'CA', 'CA-QC');
  var seller = createCollector('dsell3', 'Ben Seller', 'CA', 'CA-ON');
  var corePrinting = printingOf(seller.token, query);
  var core = check(
    http.post(api + '/api/v1/binders', {
      headers: headers(seller.token),
      body: JSON.stringify({
        name: 'Maestro Moth core',
        visibility: 'PUBLIC',
        sellsAsCore: true,
        askingPriceText: '$95',
        gameId: gameIdOf(corePrinting.game),
        description: 'Fictional deck core of the Maestro flows.',
      }),
    }),
    'POST /binders (deck core)'
  );
  check(
    http.post(api + '/api/v1/inventory/items', {
      headers: headers(seller.token),
      body: JSON.stringify({
        printingId: corePrinting.printingId,
        binderId: core.id,
        visibility: 'PRIVATE',
        quantity: 2,
      }),
    }),
    'POST /inventory/items (key card)'
  );
  output.ada = account(buyer);
  output.ben = account(seller);
  output.core = { id: core.id, name: 'Maestro Moth core' };
} else if (action === 'buyer-card-setup') {
  var cardBuyer = createCollector('dbuy4', 'Ada Buyer', 'CA', 'CA-QC');
  var cardSeller = createCollector('dsell4', 'Ben Seller', 'CA', 'CA-ON');
  var cardPrinting = printingOf(cardSeller.token, query);
  var sellerBinder = check(
    http.post(api + '/api/v1/binders', {
      headers: headers(cardSeller.token),
      body: JSON.stringify({
        name: 'Trades',
        visibility: 'PUBLIC',
        gameId: gameIdOf(cardPrinting.game),
      }),
    }),
    'POST /binders'
  );
  var sellerItem = check(
    http.post(api + '/api/v1/inventory/items', {
      headers: headers(cardSeller.token),
      body: JSON.stringify({
        printingId: cardPrinting.printingId,
        binderId: sellerBinder.id,
        visibility: 'PUBLIC',
        quantity: 1,
        askingPriceText: '$32',
      }),
    }),
    'POST /inventory/items'
  );
  var cardChat = check(
    http.post(api + '/api/v1/conversations', {
      headers: headers(cardBuyer.token),
      body: JSON.stringify({ recipientId: cardSeller.id, subjectItemId: sellerItem.id }),
    }),
    'POST /conversations (about the card)'
  );
  var lines = [
    [cardBuyer, 'Hi! Is your ' + cardPrinting.name + ' still available?'],
    [cardSeller, 'Yes! Near mint, English. $32 + $4 tracked shipping.'],
  ];
  for (var l = 0; l < lines.length; l++) {
    check(
      http.post(api + '/api/v1/conversations/' + cardChat.id + '/messages', {
        headers: headers(lines[l][0].token),
        body: JSON.stringify({ kind: 'TEXT', body: lines[l][1] }),
      }),
      'POST message'
    );
  }
  output.ada = account(cardBuyer);
  output.ben = account(cardSeller);
  output.conversation = { id: cardChat.id };
  output.card = { itemId: sellerItem.id, name: cardPrinting.name };
} else if (action === 'mark-sold') {
  var sale = {};
  if (typeof TRACKING !== 'undefined' && TRACKING) {
    sale.trackingNumber = TRACKING;
  }
  check(
    http.post(api + '/api/v1/conversations/' + CONVERSATION + '/sales', {
      headers: headers(signIn(EMAIL, PASSWORD)),
      body: JSON.stringify(sale),
    }),
    'POST /conversations/{id}/sales'
  );
} else if (action === 'expect-body') {
  var bodies = check(
    http.get(api + '/api/v1/conversations/' + CONVERSATION + '/messages?limit=30', {
      headers: headers(signIn(EMAIL, PASSWORD)),
    }),
    'GET messages'
  ).items;
  var found = false;
  for (var b = 0; b < bodies.length; b++) {
    if (bodies[b].body === EXPECT_BODY) {
      found = true;
    }
  }
  if (!found) {
    throw new Error('No message "' + EXPECT_BODY + '" in the conversation.');
  }
} else if (action === 'expect-sales') {
  var token = signIn(EMAIL, PASSWORD);
  var items = check(
    http.get(api + '/api/v1/conversations/' + CONVERSATION + '/messages?limit=30', {
      headers: headers(token),
    }),
    'GET messages'
  ).items;
  var sales = [];
  for (var s = 0; s < items.length; s++) {
    if (items[s].kind === 'SYSTEM' && items[s].payload && items[s].payload.sale) {
      sales.push(items[s].payload.sale);
    }
  }
  if (String(sales.length) !== String(EXPECT_SALES)) {
    throw new Error('Expected ' + EXPECT_SALES + ' sale message(s), got ' + JSON.stringify(sales));
  }
  if (
    sales.length > 0 &&
    typeof EXPECT_TRACKING !== 'undefined' &&
    sales[0].trackingNumber !== EXPECT_TRACKING
  ) {
    throw new Error('The sale carries tracking ' + sales[0].trackingNumber);
  }
  var notifications = check(
    http.get(api + '/api/v1/notifications', { headers: headers(token) }),
    'GET notifications'
  ).items;
  var sold = 0;
  for (var n = 0; n < notifications.length; n++) {
    if (notifications[n].type === 'SALE_RECORDED') {
      sold++;
    }
  }
  if (String(sold) !== String(EXPECT_SALES)) {
    throw new Error('Expected ' + EXPECT_SALES + ' "sold to you" notice(s), got ' + sold);
  }
} else {
  throw new Error('Unknown ACTION ' + action);
}
