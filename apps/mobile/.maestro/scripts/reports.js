// Maestro runScript (runs on the host): the collectors of the report flow, driven through the
// local Firebase Auth emulator and the isolated mobile E2E API (:8090, database
// orenjitrade_mobile_e2e). Only fresh, fictional `@mobile-e2e.test` accounts of this run are
// created or used; seed accounts are never touched. (Moved out of the offers script when offers
// left the phone, ADR 0018.)
//
// ACTION=reporting creates Ada (the reporter, the app user) and Bo (the reported collector).
//   Outputs: output.ada.{email, password, displayName}, output.bo.{handle, displayName}
// ACTION=community (stage R11) creates Ada (the app user) and Bo, who posts BODY in the room SLUG
//   (a Yu-Gi-Oh! room of Americas (North) by default) through the API.
//   Outputs: output.ada.{email, password, displayName, handle},
//   output.bo.{handle, displayName, email, password}, output.boPost.{id}
// ACTION=community-answer (R11 review fix 1) signs in as EMAIL / PASSWORD and posts BODY in the
//   room SLUG through the API while the app shows it. Output: output.boAnswer.{id}
// ACTION=expect-report checks, as Ada, that she has one OPEN report against HANDLE with REASON.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, RUN_ID, ACTION, and per action EMAIL, PASSWORD,
// HANDLE, REASON.

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
    throw new Error('reports.js only acts as the run accounts (@mobile-e2e.test).');
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

if (action === 'reporting') {
  var reporter = createCollector('ada', 'Ada Reporter', null);
  var reported = createCollector('bo', 'Bo Reported', null);
  output.ada = {
    email: reporter.email,
    password: reporter.password,
    displayName: reporter.displayName,
  };
  output.bo = { handle: reported.handle, displayName: reported.displayName };
} else if (action === 'community') {
  var poster = createCollector('ada', 'Ada Poster', null);
  var other = createCollector('bo', 'Bo Poster', null);
  var room = typeof SLUG !== 'undefined' && SLUG ? SLUG : 'americas-north-yugioh';
  var body =
    typeof BODY !== 'undefined' && BODY ? BODY : 'Looking for Nibiru by mail ' + other.handle;
  var post = check(
    http.post(api + '/api/v1/community/channels/' + room + '/posts', {
      headers: jsonHeaders(other.token),
      body: JSON.stringify({ body: body }),
    }),
    'POST a post as Bo'
  );
  output.ada = {
    email: poster.email,
    password: poster.password,
    displayName: poster.displayName,
    handle: poster.handle,
  };
  output.bo = {
    handle: other.handle,
    displayName: other.displayName,
    email: other.email,
    password: other.password,
  };
  output.boPost = { id: post.id, body: body };
} else if (action === 'community-answer') {
  var answer = check(
    http.post(api + '/api/v1/community/channels/' + SLUG + '/posts', {
      headers: jsonHeaders(signIn(EMAIL, PASSWORD)),
      body: JSON.stringify({ body: BODY }),
    }),
    'POST an answer'
  );
  output.boAnswer = { id: answer.id };
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
