import { API_URL, isolationRefusal, readJson } from './isolation';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:19006';

/**
 * Refuses to run the specs against anything but the isolated mobile E2E stack: the API must be
 * the one `npm run test:mobile:e2e` started on :8090 (its /actuator/info identity block names the
 * database orenjitrade_mobile_e2e) and the web build must be the export made for that API. The
 * developer API on :8080 writes into the developer's database and is always refused. When the
 * stack is down the specs skip, unless E2E_REQUIRE_STACK=1 (the harness and CI), which fails.
 */
export default async function globalSetup(): Promise<void> {
  const info = await readJson(`${API_URL}/actuator/info`);
  const refusal = isolationRefusal(API_URL, info);
  if (refusal === 'unreachable') {
    if (process.env.E2E_REQUIRE_STACK === '1') {
      throw new Error(`[mobile-e2e] the API at ${API_URL} is unreachable.`);
    }
    return;
  }
  if (refusal) {
    throw new Error(`[mobile-e2e] ${refusal}`);
  }
  const stamp = (await readJson(`${BASE_URL}/mobile-e2e-build.json`)) as {
    apiBaseUrl?: string;
  } | null;
  if (stamp && stamp.apiBaseUrl !== API_URL) {
    throw new Error(
      `[mobile-e2e] the web build on ${BASE_URL} talks to ${stamp.apiBaseUrl}, not to ${API_URL}; refusing to run.`
    );
  }
  if (!stamp && process.env.E2E_REQUIRE_STACK === '1') {
    throw new Error(
      `[mobile-e2e] ${BASE_URL} is not the mobile E2E web build (no mobile-e2e-build.json); refusing to run.`
    );
  }
}
