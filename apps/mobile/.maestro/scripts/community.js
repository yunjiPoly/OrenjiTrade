// Maestro runScript (runs on the host): reads a community post the flow's collector just
// published through the app, from the isolated API (:8090), so the flow can address it by id;
// with EXPECT_REPLIES it also checks the post's reply count.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD (a run account), SLUG, BODY,
// EXPECT_REPLIES (optional).
// Outputs: output.post.{id}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('community.js only reads as the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status);
  }
  return json(response.body);
}

var token = check(
  http.post(
    emulator + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',
    {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  ),
  'emulator sign-in'
).idToken;
var page = check(
  http.get(api + '/api/v1/community/channels/' + SLUG + '/posts?limit=20', {
    headers: { Authorization: 'Bearer ' + token },
  }),
  'GET posts'
);
// The channel is shared with earlier runs (their posts stay after their accounts are deleted):
// take the newest post with this body that the caller wrote (only an author may edit a post).
var post = null;
for (var i = 0; i < (page.items || []).length; i++) {
  if (page.items[i].body === BODY && page.items[i].canEdit === true) {
    post = page.items[i];
    break;
  }
}
if (!post) {
  throw new Error('No post "' + BODY + '" of the caller in ' + SLUG + '.');
}
if (typeof EXPECT_REPLIES !== 'undefined' && String(post.replyCount) !== String(EXPECT_REPLIES)) {
  throw new Error('Expected ' + EXPECT_REPLIES + ' replies, got ' + post.replyCount + '.');
}
output.post = { id: post.id };
