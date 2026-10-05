import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { DistanceUnit } from '@/src/lib/formatDistanceBucket';

export type ThemeOverride = 'system' | 'light' | 'dark';

/** A map viewport. Stored on-device only; it is the searcher's viewport, never a home location. */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Preferences that survive sign-out and app restarts. */
export interface SessionPrefs {
  distanceUnit: DistanceUnit;
  /** Pre-fills the sign-in form; never a password. */
  lastSignedInEmail: string | null;
}

export interface AppState {
  themeOverride: ThemeOverride;
  prefs: SessionPrefs;
  lastMapRegion: MapRegion | null;

  setThemeOverride: (override: ThemeOverride) => void;
  updatePrefs: (patch: Partial<SessionPrefs>) => void;
  setLastMapRegion: (region: MapRegion | null) => void;
  reset: () => void;
}

export const DEFAULT_PREFS: SessionPrefs = {
  distanceUnit: 'km',
  lastSignedInEmail: null,
};

export const APP_STORE_STORAGE_KEY = 'orenjitrade.app-store.v1';

const initialState = {
  themeOverride: 'system' as ThemeOverride,
  prefs: DEFAULT_PREFS,
  lastMapRegion: null as MapRegion | null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      setThemeOverride: (themeOverride) => set({ themeOverride }),
      updatePrefs: (patch) => set((state) => ({ prefs: { ...state.prefs, ...patch } })),
      setLastMapRegion: (lastMapRegion) => set({ lastMapRegion }),
      reset: () => set({ ...initialState }),
    }),
    {
      name: APP_STORE_STORAGE_KEY,
      version: 2,
      // v1 also stored `prefs.hasCompletedOnboarding`; onboarding now comes from `GET /me`.
      migrate: (persisted) => {
        const state = persisted as Partial<AppState> | undefined;
        const prefs: Record<string, unknown> = { ...state?.prefs };
        delete prefs.hasCompletedOnboarding;
        return { ...state, prefs: { ...DEFAULT_PREFS, ...prefs } } as AppState;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeOverride: state.themeOverride,
        prefs: state.prefs,
        lastMapRegion: state.lastMapRegion,
      }),
    }
  )
);
