/**
 * Per-account conveniences this browser keeps in `localStorage` that name the account (its
 * Firebase uid in the key): "Hide these steps" of Home's Get started (web WE) and the community
 * rooms' last visits (web WF). They go when the account signs out, so nothing of it stays behind
 * on a shared computer (WE review P4). The kept game is not among them: it stays for the next
 * sign-in, as on the phone.
 */
export const GET_STARTED_HIDDEN_PREFIX = 'orenji.home.get-started-hidden.';
/** The newest post seen in each community room, per account (web WF, the phone's room visits). */
export const ROOM_VISITS_PREFIX = 'orenji.community.visits.';

export const ACCOUNT_STORAGE_PREFIXES: readonly string[] = [
  GET_STARTED_HIDDEN_PREFIX,
  ROOM_VISITS_PREFIX,
];

/** Removes every per-account key of {@link ACCOUNT_STORAGE_PREFIXES} (storage errors ignored). */
export function clearAccountStorage(storage: Storage | null | undefined): void {
  if (!storage) {
    return;
  }
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key && ACCOUNT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      storage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable (private mode): nothing was kept.
  }
}
