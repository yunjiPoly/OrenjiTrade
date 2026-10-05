/**
 * Isolation of the web E2E suite from the developer's `npm run dev` stack (same rules as
 * `scripts/lib/web-e2e-guard.mjs`, which the harness `npm run test:e2e` applies before it starts
 * anything; kept small and dependency-free here because Playwright loads it on its own).
 *
 * The suite only ever talks to an API that publishes the E2E identity block under
 * `/actuator/info` (`orenjiWebE2e.database = orenjitrade_e2e`): the API the harness starts on
 * :8180, or the one CI starts. The developer API (:8080, database `orenjitrade`) has no such block
 * and is refused, so a bare `npx playwright test` can never fill the developer database with test
 * accounts again.
 */

/** Database of the E2E API (recreated per harness run). */
export const E2E_DB = 'orenjitrade_e2e';
/** Key of the identity block the E2E API publishes under /actuator/info. */
export const INFO_KEY = 'orenjiWebE2e';
/** Default ports of the E2E stack (the developer stack owns 8080 / 4200). */
export const E2E_API_PORT = 8180;
export const E2E_WEB_PORT = 4300;
export const DEV_API_PORT = 8080;
/** Email domain of every account the web suites create; seed accounts use orenjitrade.test. */
export const E2E_EMAIL_DOMAIN = 'example.test';

/** Run id shared by the runner and its workers (set by playwright.config.ts / the harness). */
export function runId(): string {
  const value = process.env['E2E_RUN_ID'] ?? '';
  if (!/^r[a-z0-9]{3,15}$/.test(value)) {
    throw new Error(`E2E_RUN_ID "${value}" is not a run id (playwright.config.ts sets one).`);
  }
  return value;
}

/** Local part prefix of every account email of this run: `e2e-<run id>-`. */
export function runEmailPrefix(id = runId()): string {
  return `e2e-${id}-`;
}

/** True for the web suites' test addresses (never a seed account). */
export function isTestDataEmail(email: string | null | undefined): boolean {
  const value = (email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  return at > 0 && value.slice(at + 1) === E2E_EMAIL_DOMAIN;
}

/** True only for an account created by the current run. */
export function isRunAccount(email: string | null | undefined, id = runId()): boolean {
  return (
    isTestDataEmail(email) && (email ?? '').trim().toLowerCase().startsWith(runEmailPrefix(id))
  );
}

/** A fresh run id: `r` + 7 base-36 characters. */
export function newRunId(now = Date.now(), random = Math.random): string {
  const time = (now % 36 ** 5).toString(36).padStart(5, '0');
  const noise = Math.floor(random() * 36 ** 2)
    .toString(36)
    .padStart(2, '0');
  return `r${time}${noise}`;
}

/**
 * Why the API on `apiUrl`, whose `/actuator/info` answered `info`, must not be used by the suite
 * (null when it may).
 */
export function apiRefusal(apiUrl: string, info: unknown): string | null {
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    return `${apiUrl} is not a valid URL.`;
  }
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) {
    return `${apiUrl} is not on this machine; the E2E suite only runs against a local stack.`;
  }
  if (Number(url.port || 80) === DEV_API_PORT) {
    return (
      `${apiUrl} is the developer API (database orenjitrade); the E2E suite never uses it. ` +
      'Run `npm run test:e2e` (its own stack on :8180, database orenjitrade_e2e), or reuse a stack ' +
      'it left running with `npm run test:e2e -- --reuse-running`.'
    );
  }
  const identity =
    info && typeof info === 'object'
      ? ((info as Record<string, unknown>)[INFO_KEY] as Record<string, unknown> | undefined)
      : undefined;
  if (!identity || typeof identity !== 'object') {
    return (
      `The API on ${apiUrl} was not started by the E2E harness (no ${INFO_KEY} block in ` +
      '/actuator/info); refusing to run the suite against it, it may write into the developer ' +
      'database. Run `npm run test:e2e`.'
    );
  }
  if (identity['database'] !== E2E_DB) {
    return `The API on ${apiUrl} uses the database ${String(identity['database'])}, not ${E2E_DB}.`;
  }
  return null;
}
