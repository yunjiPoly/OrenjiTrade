import { API_URL } from './stack';
import { apiRefusal } from './isolation';

/**
 * Refuses to run the suite against any API but the E2E one (see `isolation.ts`). An unreachable
 * stack is left to `requireStack()` (specs skip, or fail with E2E_REQUIRE_STACK=1).
 */
export default async function globalSetup(): Promise<void> {
  let info: unknown;
  try {
    const response = await fetch(`${API_URL}/actuator/info`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return;
    }
    info = await response.json();
  } catch {
    return;
  }
  const refusal = apiRefusal(API_URL, info);
  if (refusal) {
    throw new Error(`[e2e] ${refusal}`);
  }
}
