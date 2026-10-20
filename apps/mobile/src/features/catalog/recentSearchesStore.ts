import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { boundedQuery } from '@/src/lib/catalog';

/**
 * Recent searches of the card search (owner spec 2026-10-14, sections 8, 12 and 16, default 2),
 * kept on this device only (AsyncStorage), per account (keyed by Firebase uid), newest first, at
 * most {@link RECENT_SEARCHES_MAX}. They never leave the phone: there is no server history and no
 * analytics of them. Settings › Privacy › "Remember my searches" (on by default) clears them and
 * stops them while it is off. Only search texts are stored: never a location.
 */
export const RECENT_SEARCHES_MAX = 8;
export const RECENT_SEARCHES_STORAGE_KEY = 'orenjitrade.recent-searches.v1';

interface RecentSearchesState {
  byUser: Record<string, string[]>;
  /** Accounts that turned "Remember my searches" off on this device. */
  forgetting: Record<string, true>;
  remember: (uid: string, query: string) => void;
  forget: (uid: string, query: string) => void;
  clear: (uid: string) => void;
  /** "Remember my searches": off clears the list and stops it until it is on again. */
  setRemembering: (uid: string, on: boolean) => void;
}

/** The list after recording `query`: moved to the front, case-insensitive duplicates removed. */
export function rememberSearch(list: readonly string[], query: string): string[] {
  const value = boundedQuery(query);
  if (value.length < 2) {
    return [...list];
  }
  const lower = value.toLowerCase();
  return [value, ...list.filter((entry) => entry.toLowerCase() !== lower)].slice(
    0,
    RECENT_SEARCHES_MAX
  );
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      byUser: {},
      forgetting: {},
      remember: (uid, query) =>
        set((state) =>
          state.forgetting[uid]
            ? state
            : { byUser: { ...state.byUser, [uid]: rememberSearch(state.byUser[uid] ?? [], query) } }
        ),
      forget: (uid, query) =>
        set((state) => ({
          byUser: {
            ...state.byUser,
            [uid]: (state.byUser[uid] ?? []).filter((entry) => entry !== query),
          },
        })),
      clear: (uid) =>
        set((state) => {
          const byUser = { ...state.byUser };
          delete byUser[uid];
          return { byUser };
        }),
      setRemembering: (uid, on) =>
        set((state) => {
          const forgetting = { ...state.forgetting };
          const byUser = { ...state.byUser };
          if (on) {
            delete forgetting[uid];
          } else {
            forgetting[uid] = true;
            delete byUser[uid];
          }
          return { forgetting, byUser };
        }),
    }),
    {
      name: RECENT_SEARCHES_STORAGE_KEY,
      version: 2,
      // v1 kept one list per segment of the Search tab ("<uid>/collectors", "<uid>/binders");
      // stage R5 keeps the card search's only (the uid alone, as v1 did for cards).
      migrate: (persisted) => {
        const state = (persisted ?? {}) as { byUser?: Record<string, string[]> };
        const byUser: Record<string, string[]> = {};
        for (const [key, list] of Object.entries(state.byUser ?? {})) {
          if (!key.includes('/') && Array.isArray(list)) {
            byUser[key] = list;
          }
        }
        return { byUser, forgetting: {} } as unknown as RecentSearchesState;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ byUser: state.byUser, forgetting: state.forgetting }),
    }
  )
);

const NONE: readonly string[] = [];

/** The recent searches of `uid` (empty when signed out). */
export function useRecentSearches(uid: string | null): readonly string[] {
  return useRecentSearchesStore((state) => (uid ? (state.byUser[uid] ?? NONE) : NONE));
}

/** Whether "Remember my searches" is on for `uid` on this device (on by default). */
export function useRemembersSearches(uid: string | null): boolean {
  return useRecentSearchesStore((state) => (uid ? !state.forgetting[uid] : true));
}
