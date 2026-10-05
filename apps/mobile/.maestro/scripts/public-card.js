// Maestro runScript (runs on the host): reads one card a seed collector lists publicly, through
// the isolated API's public endpoint (`GET /collectors/{handle}/inventory`, no account, no write).
// The "who has this near me" flow opens that card and expects the seed collector on the map.
//
// Inputs (env): API_URL, HANDLE (default collector1).
// Outputs: output.card.{id, name}.

var api = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:8090';
var handle = typeof HANDLE !== 'undefined' ? HANDLE : 'collector1';

if (/:8080\/?$/.test(api)) {
  throw new Error('Refusing to use the developer API ' + api + ': only the isolated API on :8090.');
}

var response = http.get(api + '/api/v1/collectors/' + handle + '/inventory?size=1');
if (!response.ok) {
  throw new Error('GET /collectors/' + handle + '/inventory failed: HTTP ' + response.status);
}
var page = json(response.body);
if (!page.items || page.items.length === 0) {
  throw new Error(handle + ' lists no public card in the seed data.');
}
output.card = { id: page.items[0].card.id, name: page.items[0].card.name };
