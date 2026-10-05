import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { DistanceUnit } from '@/src/lib/formatDistanceBucket';

export type ThemeOverride = 'system' | 'light' | 'dark';

/** Preferences that survive sign-out and app restarts. */
export interface SessionPrefs {
  distanceUnit: DistanceUnit;
  /** Pre-fills the sign-in form; never a password. */
  lastSignedInEmail: string | null;
}

export interface AppState {
  themeOverride: ThemeOverride;
  prefs: SessionPrefs;

  setThemeOverride: (override: ThemeOverride) => void;
  updatePrefs: (patch: Partial<SessionPrefs>) => void;
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
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState,
      setThemeOverride: (themeOverride) => set({ themeOverride }),
      updatePrefs: (patch) => set((state) => ({ prefs: { ...state.prefs, ...patch } })),
      reset: () => set({ ...initialState }),
    }),
    {
      name: APP_STORE_STORAGE_KEY,
      version: 3,
      // v1 also stored `prefs.hasCompletedOnboarding` (onboarding now comes from `GET /me`); v1
      // and v2 stored the Map tab's last viewport, which is no longer kept on the device (the map
      // starts on the server's answer: ADR 0004, nothing location-like is persisted).
      migrate: (persisted) => {
        const state = { ...(persisted as Record<string, unknown> | undefined) };
        const prefs: Record<string, unknown> = { ...(state.prefs as object | undefined) };
        delete prefs.hasCompletedOnboarding;
        delete state.lastMapRegion;
        return { ...state, prefs: { ...DEFAULT_PREFS, ...prefs } } as unknown as AppState;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        themeOverride: state.themeOverride,
        prefs: state.prefs,
      }),
    }
  )
);
