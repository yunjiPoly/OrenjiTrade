import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { boundedQuery } from '@/src/lib/catalog';

/**
 * Recent searches of the Search tab, kept on this device only (AsyncStorage), per account (keyed
 * by Firebase uid) and per segment (cards, collectors, binders), newest first. Only search texts
 * are stored: never a location.
 */
export const RECENT_SEARCHES_MAX = 8;
export const RECENT_SEARCHES_STORAGE_KEY = 'orenjitrade.recent-searches.v1';

export type RecentSearchScope = 'cards' | 'collectors' | 'binders';

/** Storage key of a scope: the cards keep the uid alone (the key of earlier versions). */
export function recentScopeKey(uid: string, scope: RecentSearchScope = 'cards'): string {
  return scope === 'cards' ? uid : `${uid}/${scope}`;
}

interface RecentSearchesState {
  byUser: Record<string, string[]>;
  remember: (uid: string, query: string, scope?: RecentSearchScope) => void;
  forget: (uid: string, query: string, scope?: RecentSearchScope) => void;
  clear: (uid: string, scope?: RecentSearchScope) => void;
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
      remember: (uid, query, scope = 'cards') =>
        set((state) => {
          const key = recentScopeKey(uid, scope);
          return {
            byUser: { ...state.byUser, [key]: rememberSearch(state.byUser[key] ?? [], query) },
          };
        }),
      forget: (uid, query, scope = 'cards') =>
        set((state) => {
          const key = recentScopeKey(uid, scope);
          return {
            byUser: {
              ...state.byUser,
              [key]: (state.byUser[key] ?? []).filter((entry) => entry !== query),
            },
          };
        }),
      clear: (uid, scope = 'cards') =>
        set((state) => {
          const byUser = { ...state.byUser };
          delete byUser[recentScopeKey(uid, scope)];
          return { byUser };
        }),
    }),
    {
      name: RECENT_SEARCHES_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ byUser: state.byUser }),
    }
  )
);

const NONE: readonly string[] = [];

/** The recent searches of `uid` in a segment (empty when signed out). */
export function useRecentSearches(
  uid: string | null,
  scope: RecentSearchScope = 'cards'
): readonly string[] {
  return useRecentSearchesStore((state) =>
    uid ? (state.byUser[recentScopeKey(uid, scope)] ?? NONE) : NONE
  );
}
