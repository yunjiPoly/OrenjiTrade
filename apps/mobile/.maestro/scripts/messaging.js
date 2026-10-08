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
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD,
// CONVERSATION, BODY, EXPECT_BODY, EXPECT_READ.

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
} else {
  throw new Error('Unknown ACTION ' + action);
}
