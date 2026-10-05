import { deleteRunAccounts } from './isolation';

/**
 * Deletes, best effort, the Auth emulator accounts this run created
 * (`m-<run id>-...@mobile-e2e.test`); never seeds (`@orenjitrade.test`), never other suites'
 * accounts. Their rows stay in the isolated database, which the harness recreates per run.
 */
export default async function globalTeardown(): Promise<void> {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) {
    return;
  }
  try {
    const deleted = await deleteRunAccounts(runId);
    console.log(`[mobile-e2e] deleted ${deleted} Auth emulator account(s) of run ${runId}`);
  } catch (error) {
    console.warn(`[mobile-e2e] could not delete the accounts of run ${runId}: ${String(error)}`);
  }
}
