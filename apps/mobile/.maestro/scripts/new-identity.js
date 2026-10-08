// Maestro runScript: a unique, fictional identity for the sign-up flow. The email is
// `m-<RUN_ID>-maestro-signup-<suffix>@mobile-e2e.test`, so the harness deletes it from the Auth
// emulator at the end of the run.
// Inputs (env): RUN_ID. Outputs: output.signup.{email, password}.
var runId = typeof RUN_ID !== 'undefined' ? RUN_ID : 'rmanual0';
var suffix = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
output.signup = {
  email: 'm-' + runId + '-maestro-signup-' + suffix + '@mobile-e2e.test',
  password: 'Maestro-Pass-42',
};
