import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { boundedQuery } from '@/src/lib/catalog';

/**
 * Recent catalog searches of the Search tab, kept on this device only (AsyncStorage) and per
 * account (keyed by Firebase uid), newest first. Only card search texts are stored: never a
 * location.
 */
export const RECENT_SEARCHES_MAX = 8;
export const RECENT_SEARCHES_STORAGE_KEY = 'orenjitrade.recent-searches.v1';

interface RecentSearchesState {
  byUser: Record<string, string[]>;
  remember: (uid: string, query: string) => void;
  forget: (uid: string, query: string) => void;
  clear: (uid: string) => void;
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
      remember: (uid, query) =>
        set((state) => ({
          byUser: { ...state.byUser, [uid]: rememberSearch(state.byUser[uid] ?? [], query) },
        })),
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

/** The recent searches of `uid` (empty when signed out). */
export function useRecentSearches(uid: string | null): readonly string[] {
  return useRecentSearchesStore((state) => (uid ? (state.byUser[uid] ?? NONE) : NONE));
}
