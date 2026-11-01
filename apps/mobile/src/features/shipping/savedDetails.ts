import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

import { useUid } from '@/src/api/hooks/useUid';

import {
  unloadSavedDetails,
  useSavedDetailsStore,
  type SavedDetailKind,
} from './savedDetailsStore';

export { unloadSavedDetails, type SavedDetailKind };

/*
 * The buyer's shipping address and the seller's e-Transfer email or phone number (owner spec
 * 2026-10-14, sections 10 and 13; spec section 16, default 3): saved on this phone only, in its
 * secure storage (expo-secure-store; Expo web, used by the test suite, keeps them in localStorage
 * or, without it, in memory), one pair per signed-in account. They never reach the server except
 * inside a message the collector checks in the message box and sends; they are never logged, never
 * in analytics, never in the query cache. They stay on the phone across sign-outs (keyed by
 * account) and are deleted with the account's deletion request (review fix 1, P3).
 */

/** Longest saved text: an address of a few lines, an email or a phone number. */
export const SAVED_DETAIL_MAX: Readonly<Record<SavedDetailKind, number>> = {
  address: 300,
  etransfer: 120,
};

const KEY_PREFIX = 'orenji.shipping';
/** In-memory fallback of Expo web without localStorage (and of a failing secure store). */
const memory = new Map<string, string>();

/** The storage key of a detail (secure store keys allow letters, digits, ".", "-", "_"). */
export function savedDetailKey(kind: SavedDetailKind, uid: string): string {
  return `${KEY_PREFIX}.${kind}.${uid.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

function webStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

async function readKey(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    const storage = webStorage();
    try {
      return storage ? storage.getItem(key) : (memory.get(key) ?? null);
    } catch {
      return memory.get(key) ?? null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function writeKey(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    const storage = webStorage();
    try {
      if (storage) {
        storage.setItem(key, value);
        return;
      }
    } catch {
      // Falls back to memory below.
    }
    memory.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function removeKey(key: string): Promise<void> {
  memory.delete(key);
  if (Platform.OS === 'web') {
    try {
      webStorage()?.removeItem(key);
    } catch {
      // Nothing kept.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

/** A detail as saved, trimmed of blank lines around it; `null` when nothing is saved. */
export function cleanDetail(kind: SavedDetailKind, raw: string): string | null {
  const text =
    kind === 'address'
      ? raw
          .split('\n')
          .map((line) => line.trim())
          .join('\n')
          .trim()
      : raw.trim();
  return text ? text : null;
}

/** Forgets everything, the in-memory fallback storage included (tests). */
export function resetSavedDetails(): void {
  memory.clear();
  unloadSavedDetails();
}

/**
 * Deletes both saved details of an account from this phone (its deletion was requested, review
 * fix 1, P3): no screen is left to delete them from afterwards, and nothing should outlive the
 * account in the phone's keychain.
 */
export async function deleteSavedDetails(uid: string): Promise<void> {
  await Promise.all(
    (['address', 'etransfer'] as const).map((kind) =>
      removeKey(savedDetailKey(kind, uid)).catch(() => undefined)
    )
  );
  if (useSavedDetailsStore.getState().uid === uid) {
    unloadSavedDetails();
  }
}

/**
 * The signed-in collector's saved details, read once from the phone's secure storage, with save
 * and delete. `loaded` is false until they were read.
 */
export function useSavedDetails() {
  const uid = useUid();
  const state = useSavedDetailsStore();
  const current = state.uid === uid && state.loaded;

  useEffect(() => {
    if (!uid || (useSavedDetailsStore.getState().uid === uid && state.loaded)) {
      return;
    }
    let cancelled = false;
    void Promise.all([
      readKey(savedDetailKey('address', uid)).catch(() => null),
      readKey(savedDetailKey('etransfer', uid)).catch(() => null),
    ]).then(([address, etransfer]) => {
      if (!cancelled) {
        useSavedDetailsStore.getState().setAll(uid, address, etransfer);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state.loaded, uid]);

  const save = useCallback(
    async (kind: SavedDetailKind, raw: string): Promise<string | null> => {
      if (!uid) {
        return null;
      }
      const value = cleanDetail(kind, raw);
      if (value === null) {
        await removeKey(savedDetailKey(kind, uid));
      } else {
        await writeKey(savedDetailKey(kind, uid), value);
      }
      useSavedDetailsStore.getState().setOne(kind, value);
      return value;
    },
    [uid]
  );

  const clear = useCallback(
    async (kind: SavedDetailKind): Promise<void> => {
      if (!uid) {
        return;
      }
      await removeKey(savedDetailKey(kind, uid));
      useSavedDetailsStore.getState().setOne(kind, null);
    },
    [uid]
  );

  return {
    loaded: current,
    address: current ? state.address : null,
    etransfer: current ? state.etransfer : null,
    save,
    clear,
  };
}
