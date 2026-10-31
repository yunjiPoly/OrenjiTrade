// Maestro runScript (runs on the host): checks one binder of a Maestro collector as the isolated
// API (:8090) holds it after a flow (stage R3, binders and deck cores), and, when asked, its public
// page as an anonymous buyer sees it (`GET /public/binders/{id}`: the deck core's price, photos
// and key cards, the owner's state and country, never a city). Signs in through the local Auth
// emulator with the collector's own test credentials; writes nothing.
//
// Inputs (env): API_URL, AUTH_EMULATOR_URL, EMAIL, PASSWORD, NAME (the binder),
// EXPECT_CORE ('true' | 'false'), EXPECT_VISIBILITY (PRIVATE | PUBLIC), EXPECT_PRICE_TEXT,
// EXPECT_PRICE ('null' or an amount), EXPECT_NOTE, EXPECT_PHOTOS (a count), EXPECT_PHOTO_SIZE
// ('600x800': the fictional picture of the flow, which the API keeps as it is), EXPECT_ITEMS (a
// count), EXPECT_KEY_CARD (a card name the public page lists), EXPECT_PUBLIC_PLACE (the label of
// the owner's place on the public page). Every input but NAME is optional.
// Outputs: output.binder.{id, name}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}
if (!/@mobile-e2e\.test$/.test(EMAIL)) {
  throw new Error('check-binder.js only reads the run accounts (@mobile-e2e.test).');
}

function check(response, what) {
  if (!response.ok) {
    throw new Error(what + ' failed: HTTP ' + response.status + ' ' + response.body);
  }
  return json(response.body);
}

function expectEqual(what, actual, expected) {
  if (String(actual) !== String(expected)) {
    throw new Error(what + ': expected ' + expected + ', the API holds ' + actual);
  }
}

// Optional inputs: undefined when the flow does not pass them.
var expected = {
  core: typeof EXPECT_CORE !== 'undefined' ? EXPECT_CORE : undefined,
  visibility: typeof EXPECT_VISIBILITY !== 'undefined' ? EXPECT_VISIBILITY : undefined,
  priceText: typeof EXPECT_PRICE_TEXT !== 'undefined' ? EXPECT_PRICE_TEXT : undefined,
  price: typeof EXPECT_PRICE !== 'undefined' ? EXPECT_PRICE : undefined,
  note: typeof EXPECT_NOTE !== 'undefined' ? EXPECT_NOTE : undefined,
  photos: typeof EXPECT_PHOTOS !== 'undefined' ? EXPECT_PHOTOS : undefined,
  photoSize: typeof EXPECT_PHOTO_SIZE !== 'undefined' ? EXPECT_PHOTO_SIZE : undefined,
  items: typeof EXPECT_ITEMS !== 'undefined' ? EXPECT_ITEMS : undefined,
  keyCard: typeof EXPECT_KEY_CARD !== 'undefined' ? EXPECT_KEY_CARD : undefined,
  place: typeof EXPECT_PUBLIC_PLACE !== 'undefined' ? EXPECT_PUBLIC_PLACE : undefined,
};

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
var auth = { Authorization: 'Bearer ' + session.idToken };

var binders = check(http.get(api + '/api/v1/binders', { headers: auth }), 'GET /binders');
var binder = null;
for (var i = 0; i < binders.length; i++) {
  if (binders[i].name === NAME) {
    binder = binders[i];
  }
}
if (!binder) {
  throw new Error('No binder named ' + NAME + ' (the API holds ' + binders.length + ').');
}

if (expected.core !== undefined) {
  expectEqual('sellsAsCore', binder.sellsAsCore, expected.core);
}
if (expected.visibility !== undefined) {
  expectEqual('visibility', binder.visibility, expected.visibility);
}
if (expected.priceText !== undefined) {
  expectEqual('askingPriceText', binder.askingPriceText, expected.priceText);
}
if (expected.price !== undefined) {
  expectEqual(
    'askingPrice',
    binder.askingPrice === null ? 'null' : Number(binder.askingPrice),
    expected.price === 'null' ? 'null' : Number(expected.price)
  );
}
if (expected.note !== undefined) {
  expectEqual('description', binder.description, expected.note);
}
if (expected.photos !== undefined) {
  expectEqual('photos', (binder.photos || []).length, expected.photos);
}
if (expected.photoSize !== undefined) {
  var photo = (binder.photos || [])[0];
  if (!photo) {
    throw new Error('The binder has no photo.');
  }
  expectEqual('the photo', photo.width + 'x' + photo.height, expected.photoSize);
}
if (expected.items !== undefined) {
  expectEqual('itemCount', binder.itemCount, expected.items);
}

if (expected.keyCard !== undefined || expected.place !== undefined) {
  // What any buyer sees: no token.
  var page = check(
    http.get(api + '/api/v1/public/binders/' + binder.id),
    'GET /public/binders/{id}'
  );
  if (expected.keyCard !== undefined) {
    var names = (page.keyCards || []).map(function (card) {
      return card.name;
    });
    if (names.indexOf(expected.keyCard) < 0) {
      throw new Error('Key cards: expected ' + expected.keyCard + ', the page lists ' + names);
    }
  }
  if (expected.place !== undefined) {
    expectEqual('the owner place', page.owner.place && page.owner.place.label, expected.place);
    if (page.owner.place && page.owner.place.city) {
      throw new Error('The public page carries a city.');
    }
  }
}

output.binder = { id: binder.id, name: binder.name };
