// Maestro runScript (runs on the host): the second user of the messaging flows, driven through
// the local Firebase Auth emulator and the isolated mobile E2E API (:8090, database
// orenjitrade_mobile_e2e), like the Playwright specs' API helpers. Only `@mobile-e2e.test`
// accounts of this run are created or used; seed accounts are never touched.
//
// ACTION=setup creates two fresh, fictional collectors (Ada uses the app, Ben is driven from
//   here), opens a conversation from Ben to Ada and sends Ben's first message.
//   Outputs: output.ada.{email, password, handle, displayName},
//            output.ben.{email, password, handle, displayName}, output.conversation.id
// ACTION=send sends BODY as Ben (EMAIL / PASSWORD = Ben's) in CONVERSATION.
// ACTION=expect checks, as Ben, that the conversation holds a message with body EXPECT_BODY
//   (Ada's reply sent from the app) and, with EXPECT_READ=true, that Ben's messages are read.
// ACTION=qualify sends, in CONVERSATION, three more messages as Ben (EMAIL / PASSWORD) and three
//   as Ada (ADA_EMAIL / ADA_PASSWORD), so each side sent at least three (rating eligibility,
//   Phase 7), then waits until Ada may rate Ben (the ratings module records it after commit).
// ACTION=expect-rating checks, as Ada (EMAIL / PASSWORD), that Ben (HANDLE) holds her rating with
//   EXPECT_OVERALL stars and no meetup score (collectors don't meet, ADR 0018).
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD,
// ADA_EMAIL, ADA_PASSWORD, CONVERSATION, BODY, EXPECT_BODY, EXPECT_READ, HANDLE, EXPECT_OVERALL.

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
    throw new Error('messaging.js only acts as the run accounts (@mobile-e2e.test).');
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

function createCollector(prefix, displayName) {
  var suffix = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  var email = 'm-' + runId + '-maestro-' + prefix + '-' + suffix + '@mobile-e2e.test';
  var password = 'Maestro-Pass-42';
  var handle = ('m' + prefix + '_' + suffix)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
  var signUp = check(
    http.post(emulator + '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-key', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
    }),
    'emulator sign-up'
  );
  var token = signUp.idToken;
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
  return {
    email: email,
    password: password,
    handle: handle,
    displayName: displayName,
    id: me.id,
    token: token,
  };
}

function send(token, conversationId, body) {
  check(
    http.post(api + '/api/v1/conversations/' + conversationId + '/messages', {
      headers: jsonHeaders(token),
      body: JSON.stringify({ kind: 'TEXT', body: body }),
    }),
    'POST message'
  );
}

if (action === 'setup') {
  var ada = createCollector('ada', 'Ada Maestro');
  var ben = createCollector('ben', 'Ben Maestro');
  var conversation = check(
    http.post(api + '/api/v1/conversations', {
      headers: jsonHeaders(ben.token),
      body: JSON.stringify({ recipientId: ada.id }),
    }),
    'POST /conversations'
  );
  send(ben.token, conversation.id, 'Hi Ada, still trading the Emberfang Fox?');
  output.ada = {
    email: ada.email,
    password: ada.password,
    handle: ada.handle,
    displayName: ada.displayName,
  };
  output.ben = {
    email: ben.email,
    password: ben.password,
    handle: ben.handle,
    displayName: ben.displayName,
  };
  output.conversation = { id: conversation.id };
} else if (action === 'send') {
  send(signIn(EMAIL, PASSWORD), CONVERSATION, BODY);
} else if (action === 'expect') {
  var token = signIn(EMAIL, PASSWORD);
  var page = check(
    http.get(api + '/api/v1/conversations/' + CONVERSATION + '/messages?limit=30', {
      headers: jsonHeaders(token),
    }),
    'GET messages'
  );
  var items = page.items || [];
  var found = false;
  var unread = 0;
  for (var j = 0; j < items.length; j++) {
    if (items[j].body === EXPECT_BODY) {
      found = true;
    }
    if (items[j].senderId && items[j].readByOther === false && items[j].body !== EXPECT_BODY) {
      unread++;
    }
  }
  if (!found) {
    throw new Error('No message "' + EXPECT_BODY + '" in the conversation.');
  }
  if (typeof EXPECT_READ !== 'undefined' && EXPECT_READ === 'true' && unread > 0) {
    throw new Error(unread + ' message(s) of Ben are still unread by Ada.');
  }
} else if (action === 'qualify') {
  var benToken = signIn(EMAIL, PASSWORD);
  var adaToken = signIn(ADA_EMAIL, ADA_PASSWORD);
  var lines = [
    ['How much with shipping?', 'Twelve plus three for tracking.'],
    ['Deal. e-Transfer sent.', 'Got it, shipping tomorrow.'],
    ['Thanks!', 'Thanks for buying!'],
  ];
  for (var q = 0; q < lines.length; q++) {
    send(benToken, CONVERSATION, lines[q][0]);
    send(adaToken, CONVERSATION, lines[q][1]);
  }
  var me = check(http.get(api + '/api/v1/me', { headers: jsonHeaders(benToken) }), 'GET /me');
  var eligible = false;
  var deadline = Date.now() + 30000;
  while (!eligible && Date.now() < deadline) {
    var answer = check(
      http.get(api + '/api/v1/ratings/eligibility?userId=' + me.id, {
        headers: jsonHeaders(adaToken),
      }),
      'GET /ratings/eligibility'
    );
    var interactions = answer.interactions || [];
    for (var e = 0; e < interactions.length; e++) {
      if (!interactions[e].alreadyRated) {
        eligible = true;
      }
    }
    var until = Date.now() + 500;
    while (!eligible && Date.now() < until) {
      // Busy wait: host scripts have no timer.
    }
  }
  if (!eligible) {
    throw new Error('Ada still cannot rate Ben after the qualifying messages.');
  }
} else if (action === 'expect-rating') {
  var ratings = check(
    http.get(api + '/api/v1/collectors/' + HANDLE + '/ratings', {
      headers: jsonHeaders(signIn(EMAIL, PASSWORD)),
    }),
    'GET ratings'
  );
  var rated = ratings.items || [];
  if (rated.length !== 1 || String(rated[0].overall) !== String(EXPECT_OVERALL)) {
    throw new Error(
      'Expected one ' + EXPECT_OVERALL + '-star rating, got ' + JSON.stringify(rated)
    );
  }
  var breakdown = rated[0].breakdown || {};
  if (breakdown.meetupReliability !== null && breakdown.meetupReliability !== undefined) {
    throw new Error('The rating holds a meetup score: ' + JSON.stringify(breakdown));
  }
} else {
  throw new Error('Unknown ACTION ' + action);
}
