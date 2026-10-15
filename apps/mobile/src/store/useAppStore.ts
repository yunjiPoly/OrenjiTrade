import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemeOverride = 'system' | 'light' | 'dark';

/** How the Map tab shows a region: the drawn map, or the list of its states and provinces. */
export type MapViewChoice = 'map' | 'list';

/** Preferences that survive sign-out and app restarts. */
export interface SessionPrefs {
  /** Pre-fills the sign-in form; never a password. */
  lastSignedInEmail: string | null;
  /**
   * The view of the Map tab the collector chose last; null until they choose (the map, or the
   * list while a screen reader is on). A layout preference, nothing about a place.
   */
  mapView: MapViewChoice | null;
}

export interface AppState {
  themeOverride: ThemeOverride;
  prefs: SessionPrefs;

  setThemeOverride: (override: ThemeOverride) => void;
  updatePrefs: (patch: Partial<SessionPrefs>) => void;
  reset: () => void;
}

export const DEFAULT_PREFS: SessionPrefs = {
  lastSignedInEmail: null,
  mapView: null,
};

export const APP_STORE_STORAGE_KEY = 'orenjitrade.app-store.v1';

/**
 * A new install starts in the dark theme (owner default of the phone redesign, spec 2026-10-14,
 * sections 3 and 16). Settings → Appearance keeps System / Light / Dark, and a stored choice
 * always wins: persisted state is merged over this one when it is read back.
 */
export const DEFAULT_THEME: ThemeOverride = 'dark';

const initialState = {
  themeOverride: DEFAULT_THEME,
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
      version: 5,
      // v1 also stored `prefs.hasCompletedOnboarding` (onboarding now comes from `GET /me`); v1
      // and v2 stored the Map tab's last viewport, which is no longer kept on the device; v1 to
      // v3 stored a distance unit (there are no distances since ADR 0017); v5 adds the Map tab's
      // view (map or list). Nothing location-like is persisted.
      migrate: (persisted) => {
        const state = { ...(persisted as Record<string, unknown> | undefined) };
        const prefs: Record<string, unknown> = { ...(state.prefs as object | undefined) };
        delete prefs.hasCompletedOnboarding;
        delete prefs.distanceUnit;
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
