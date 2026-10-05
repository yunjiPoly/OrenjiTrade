// Firebase Auth emulator helpers for the local scripts (web E2E harness, test-data purge). They use
// the emulator-only "owner" credential, which a real Firebase project never accepts, and refuse any
// URL that is not on this machine.

import { isLocalUrl } from './web-e2e-guard.mjs';

export const EMULATOR_PROJECT = 'orenjitrade-local';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

function base(emulatorUrl) {
  if (!isLocalUrl(emulatorUrl)) {
    throw new Error(`Refusing to call ${emulatorUrl}: only the local Auth emulator is supported.`);
  }
  return `${emulatorUrl.replace(/\/+$/, '')}/identitytoolkit.googleapis.com/v1`;
}

async function json(response, what) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${what} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }
  return text ? JSON.parse(text) : {};
}

/** Every account of the emulator project: `{ localId, email, createdAt }`. */
export async function listEmulatorAccounts({ emulatorUrl, projectId = EMULATOR_PROJECT, fetchImpl = fetch }) {
  const accounts = [];
  let pageToken;
  do {
    const query = new URLSearchParams({ maxResults: '1000', ...(pageToken ? { nextPageToken: pageToken } : {}) });
    const body = await json(
      await fetchImpl(`${base(emulatorUrl)}/projects/${projectId}/accounts:batchGet?${query}`, { headers: OWNER }),
      'listing emulator accounts',
    );
    for (const user of body.users ?? []) {
      accounts.push({ localId: user.localId, email: user.email ?? null, createdAt: Number(user.createdAt ?? 0) });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return accounts;
}

/** Deletes the given emulator accounts (500 per call); returns how many were requested. */
export async function deleteEmulatorAccounts({ emulatorUrl, projectId = EMULATOR_PROJECT, localIds, fetchImpl = fetch }) {
  const ids = [...new Set(localIds)].filter(Boolean);
  for (let i = 0; i < ids.length; i += 500) {
    await json(
      await fetchImpl(`${base(emulatorUrl)}/projects/${projectId}/accounts:batchDelete`, {
        method: 'POST',
        headers: OWNER,
        body: JSON.stringify({ localIds: ids.slice(i, i + 500), force: true }),
      }),
      'deleting emulator accounts',
    );
  }
  return ids.length;
}

/**
 * Deletes every emulator account whose email satisfies `predicate` (never one without an email);
 * returns the deleted accounts.
 */
export async function deleteEmulatorAccountsWhere({ emulatorUrl, projectId = EMULATOR_PROJECT, predicate, fetchImpl = fetch }) {
  const accounts = (await listEmulatorAccounts({ emulatorUrl, projectId, fetchImpl })).filter(
    (account) => account.email && predicate(account.email),
  );
  await deleteEmulatorAccounts({ emulatorUrl, projectId, localIds: accounts.map((account) => account.localId), fetchImpl });
  return accounts;
}
