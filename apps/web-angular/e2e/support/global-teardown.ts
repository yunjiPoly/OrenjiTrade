import { AUTH_EMULATOR_URL, FIREBASE_PROJECT_ID } from './stack';
import { isRunAccount, runEmailPrefix, runId } from './isolation';

/**
 * Deletes, best effort, the Firebase Auth emulator accounts this run created
 * (`e2e-<run id>-...@example.test`) and nothing else: the emulator is shared with `npm run dev`
 * and the mobile suites. `npm run test:e2e` repeats this after Playwright exits (also when the run
 * crashed). Database rows stay in the E2E database, which the harness recreates per run.
 */
export default async function globalTeardown(): Promise<void> {
  const id = runId();
  const base = `${AUTH_EMULATOR_URL}/identitytoolkit.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}`;
  const headers = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
  try {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        maxResults: '1000',
        ...(pageToken ? { nextPageToken: pageToken } : {}),
      });
      const response = await fetch(`${base}/accounts:batchGet?${query}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`listing emulator accounts: HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        users?: { localId: string; email?: string }[];
        nextPageToken?: string;
      };
      for (const user of body.users ?? []) {
        if (isRunAccount(user.email, id)) {
          ids.push(user.localId);
        }
      }
      pageToken = body.nextPageToken;
    } while (pageToken);
    for (let i = 0; i < ids.length; i += 500) {
      const response = await fetch(`${base}/accounts:batchDelete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ localIds: ids.slice(i, i + 500), force: true }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`deleting emulator accounts: HTTP ${response.status}`);
      }
    }
    console.log(
      `[e2e] Deleted ${ids.length} Auth emulator account(s) of run ${id} (${runEmailPrefix(id)}*).`,
    );
  } catch (error) {
    console.warn(
      `[e2e] Could not delete the run's emulator accounts (best effort): ${String(error)}`,
    );
  }
}
