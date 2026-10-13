// Maestro runScript (runs on the host): reads what the region map of the isolated API holds for
// one state or province, through the public endpoints of the map (no account, no write):
//   GET /regions/{region}/binder-counts
//   GET /regions/{region}/subdivisions/{code}/binders
// The map flows then open that state and expect the seed binder named BINDER in its list, with
// its owner and the owner's state or province and country.
//
// Inputs (env): API_URL, REGION (default americas-north), CODE (default CA-QC), BINDER (the name
// of a seed binder of that place, default "Pokémon holo binder").
// Outputs: output.place.{region, code, count}, output.binder.{id, name, handle, owner, place}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var region = typeof REGION !== 'undefined' ? REGION : 'americas-north';
var code = typeof CODE !== 'undefined' ? CODE : 'CA-QC';
var wanted = typeof BINDER !== 'undefined' ? BINDER : 'Pokémon holo binder';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}

var counts = http.get(api + '/api/v1/regions/' + region + '/binder-counts');
if (!counts.ok) {
  throw new Error('GET /regions/' + region + '/binder-counts failed: HTTP ' + counts.status);
}
var count = 0;
var subdivisions = json(counts.body).subdivisions || [];
for (var i = 0; i < subdivisions.length; i++) {
  if (subdivisions[i].code === code) {
    count = subdivisions[i].binderCount;
  }
}
if (count === 0) {
  throw new Error(code + ' holds no public binder in the seed data of ' + region + '.');
}

var list = http.get(
  api + '/api/v1/regions/' + region + '/subdivisions/' + code + '/binders?limit=50'
);
if (!list.ok) {
  throw new Error(
    'GET /regions/' + region + '/subdivisions/' + code + '/binders: HTTP ' + list.status
  );
}
var binders = json(list.body).items || [];
var found = null;
for (var j = 0; j < binders.length; j++) {
  if (binders[j].name === wanted) {
    found = binders[j];
  }
}
if (!found) {
  throw new Error('No public binder named "' + wanted + '" in ' + code + '.');
}
if (!found.owner || !found.owner.place || !found.owner.place.label) {
  throw new Error('The binder "' + wanted + '" has no owner place in the answer.');
}
// The answer of the map never carries a city or a coordinate (ADR 0017).
var text = JSON.stringify(found);
if (/"(city|lat|lng|latitude|longitude|distance|radius)[A-Za-z]*"\s*:/.test(text)) {
  throw new Error('The binder list of ' + code + ' carries a city or a position: ' + text);
}

output.place = { region: region, code: code, count: count };
output.binder = {
  id: found.id,
  name: found.name,
  handle: found.owner.handle,
  owner: found.owner.displayName,
  place: found.owner.place.label,
};
