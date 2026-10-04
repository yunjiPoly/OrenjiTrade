// Maestro runScript: applies the latest verification code the local Firebase Auth emulator
// generated for EMAIL (no real email is ever sent locally).
// Inputs (env): EMAIL, AUTH_EMULATOR_URL.
var emulator =
  typeof AUTH_EMULATOR_URL !== 'undefined' ? AUTH_EMULATOR_URL : 'http://localhost:9099';
var response = http.get(emulator + '/emulator/v1/projects/orenjitrade-local/oobCodes');
if (!response.ok) {
  throw new Error('Listing the emulator verification codes failed: HTTP ' + response.status);
}
var codes = json(response.body).oobCodes || [];
var code = null;
for (var i = 0; i < codes.length; i++) {
  if (codes[i].email === EMAIL && codes[i].requestType === 'VERIFY_EMAIL') {
    code = codes[i].oobCode;
  }
}
if (!code) {
  throw new Error('No verification code for ' + EMAIL);
}
var applied = http.post(
  emulator + '/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-local-key',
  {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oobCode: code }),
  }
);
if (!applied.ok) {
  throw new Error('Applying the verification code failed: HTTP ' + applied.status);
}
