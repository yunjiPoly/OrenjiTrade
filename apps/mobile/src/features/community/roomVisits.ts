import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';

import { useUid } from '@/src/api/hooks/useUid';

import { laterOf } from './communityHelpers';

/**
 * When the collector last read each room on this phone (stage R11, screen 32: a room is bold with
 * an orange dot while it has posts newer than the last visit on this phone). Kept per account in
 * AsyncStorage (keyed by the account's uid): the room slugs and the time of the newest post read
 * in each, nothing else. Nothing goes to the server; another phone has its own.
 */
export const ROOM_VISITS_STORAGE_PREFIX = 'orenjitrade.community-visits.v1.';

type Visits = Readonly<Record<string, string>>;

interface RoomVisitsState {
  /** Per account uid: room slug → the newest post time read there (ISO). */
  visits: Readonly<Record<string, Visits>>;
}

const INITIAL: RoomVisitsState = { visits: {} };

export const useRoomVisitsStore = create<RoomVisitsState>()(() => INITIAL);

const hydrations = new Map<string, Promise<void>>();

function storageKey(uid: string): string {
  return `${ROOM_VISITS_STORAGE_PREFIX}${uid}`;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The visits a stored value holds (anything malformed is dropped). */
export function parseVisits(raw: string | null): Visits {
  if (!raw) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const visits: Record<string, string> = {};
    for (const [slug, at] of Object.entries(value as Record<string, unknown>)) {
      if (
        SLUG.test(slug) &&
        slug.length <= 64 &&
        typeof at === 'string' &&
        !Number.isNaN(Date.parse(at))
      ) {
        visits[slug] = at;
      }
    }
    return visits;
  } catch {
    return {};
  }
}

/** Reads this account's visits once. Storage can fail (a private window): every room is new then. */
export function hydrateRoomVisits(uid: string): Promise<void> {
  let hydration = hydrations.get(uid);
  if (!hydration) {
    hydration = (async () => {
      let stored: Visits = {};
      try {
        stored = parseVisits(await AsyncStorage.getItem(storageKey(uid)));
      } catch {
        stored = {};
      }
      useRoomVisitsStore.setState((state) => ({
        // A visit recorded while the storage was being read is newer than what it held.
        visits: { ...state.visits, [uid]: { ...stored, ...state.visits[uid] } },
      }));
    })();
    hydrations.set(uid, hydration);
  }
  return hydration;
}

/** Forgets every visit read in this session (tests, between two cases). */
export function resetRoomVisits(): void {
  hydrations.clear();
  useRoomVisitsStore.setState(INITIAL);
}

/** Records that the collector read a room up to `at` (never moves back) and keeps it on the phone. */
export async function markRoomVisited(uid: string, slug: string, at: string): Promise<void> {
  if (!SLUG.test(slug) || Number.isNaN(Date.parse(at))) {
    return;
  }
  const current = useRoomVisitsStore.getState().visits[uid]?.[slug];
  const next = laterOf(current, at);
  if (next === current) {
    return;
  }
  useRoomVisitsStore.setState((state) => ({
    visits: { ...state.visits, [uid]: { ...state.visits[uid], [slug]: next } },
  }));
  try {
    await hydrateRoomVisits(uid);
    await AsyncStorage.setItem(
      storageKey(uid),
      JSON.stringify(useRoomVisitsStore.getState().visits[uid] ?? {})
    );
  } catch {
    // The visit still counts for this session.
  }
}

const NO_VISITS: Visits = {};

/** The signed-in collector's visits on this phone, and a way to record one. */
export function useRoomVisits(): {
  visits: Visits;
  visit: (slug: string, at: string) => void;
} {
  const uid = useUid();
  useEffect(() => {
    if (uid) {
      void hydrateRoomVisits(uid);
    }
  }, [uid]);
  const visits = useRoomVisitsStore((state) =>
    uid ? (state.visits[uid] ?? NO_VISITS) : NO_VISITS
  );
  const visit = useCallback(
    (slug: string, at: string) => {
      if (uid) {
        void markRoomVisited(uid, slug, at);
      }
    },
    [uid]
  );
  return { visits, visit };
}
