import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  APP_STORE_STORAGE_KEY,
  DEFAULT_PREFS,
  DEFAULT_THEME,
  useAppStore,
} from '@/src/store/useAppStore';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useAppStore', () => {
  beforeEach(async () => {
    useAppStore.getState().reset();
    await AsyncStorage.clear();
  });

  it('starts a new install in the dark theme with default prefs (redesign default)', () => {
    const state = useAppStore.getState();
    expect(DEFAULT_THEME).toBe('dark');
    expect(state.themeOverride).toBe('dark');
    expect(state.prefs).toEqual(DEFAULT_PREFS);
  });

  it('updates the theme override', () => {
    useAppStore.getState().setThemeOverride('light');
    expect(useAppStore.getState().themeOverride).toBe('light');
  });

  it.each(['system', 'light', 'dark'] as const)(
    'keeps the stored "%s" choice of an existing install over the new default',
    async (choice) => {
      await AsyncStorage.setItem(
        APP_STORE_STORAGE_KEY,
        JSON.stringify({ version: 5, state: { themeOverride: choice, prefs: DEFAULT_PREFS } })
      );
      await useAppStore.persist.rehydrate();
      expect(useAppStore.getState().themeOverride).toBe(choice);
    }
  );

  it('stays dark when nothing was stored yet (a new install)', async () => {
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().themeOverride).toBe('dark');
  });

  it('merges preference patches', () => {
    useAppStore.getState().updatePrefs({ lastSignedInEmail: 'ayumi@example.test' });
    expect(useAppStore.getState().prefs).toEqual({
      ...DEFAULT_PREFS,
      lastSignedInEmail: 'ayumi@example.test',
    });
    // The Map tab's view (map or list) is kept the same way; a patch leaves the rest alone.
    useAppStore.getState().updatePrefs({ mapView: 'list' });
    expect(useAppStore.getState().prefs).toEqual({
      lastSignedInEmail: 'ayumi@example.test',
      mapView: 'list',
    });
  });

  it('resets to the initial state', () => {
    useAppStore.getState().setThemeOverride('light');
    useAppStore.getState().updatePrefs({ lastSignedInEmail: 'x@example.test' });
    useAppStore.getState().reset();
    expect(useAppStore.getState().themeOverride).toBe('dark');
    expect(useAppStore.getState().prefs).toEqual(DEFAULT_PREFS);
  });

  it('persists only the whitelisted slice (never a password or coordinates of the collector)', async () => {
    useAppStore.getState().setThemeOverride('light');
    await flush();
    const raw = await AsyncStorage.getItem(APP_STORE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(persisted.version).toBe(5);
    expect(persisted.state).toEqual({ themeOverride: 'light', prefs: DEFAULT_PREFS });
  });

  it('migrates version 1 (which stored the onboarding flag on the device)', async () => {
    await AsyncStorage.setItem(
      APP_STORE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          themeOverride: 'light',
          prefs: {
            distanceUnit: 'km',
            hasCompletedOnboarding: true,
            lastSignedInEmail: 'old@example.test',
          },
          lastMapRegion: null,
        },
      })
    );
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().themeOverride).toBe('light');
    // The distance unit of versions 1 to 3 is dropped too (no distances since ADR 0017).
    expect(useAppStore.getState().prefs).toEqual({
      ...DEFAULT_PREFS,
      lastSignedInEmail: 'old@example.test',
    });
  });

  it('drops the distance unit version 3 kept', async () => {
    await AsyncStorage.setItem(
      APP_STORE_STORAGE_KEY,
      JSON.stringify({
        version: 3,
        state: {
          themeOverride: 'dark',
          prefs: { distanceUnit: 'mi', lastSignedInEmail: null },
        },
      })
    );
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().prefs).toEqual(DEFAULT_PREFS);
    expect(useAppStore.getState().prefs).not.toHaveProperty('distanceUnit');
  });

  it('gives version 4 (before the Map tab had a list) no view choice yet', async () => {
    await AsyncStorage.setItem(
      APP_STORE_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        state: { themeOverride: 'dark', prefs: { lastSignedInEmail: 'kept@example.test' } },
      })
    );
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().prefs).toEqual({
      lastSignedInEmail: 'kept@example.test',
      mapView: null,
    });
  });

  it('drops the map viewport versions 1 and 2 kept on the device', async () => {
    await AsyncStorage.setItem(
      APP_STORE_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          themeOverride: 'dark',
          prefs: DEFAULT_PREFS,
          lastMapRegion: {
            latitude: 45.5,
            longitude: -73.57,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          },
        },
      })
    );
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState()).not.toHaveProperty('lastMapRegion');
    await flush();
    useAppStore.getState().setThemeOverride('light');
    await flush();
    const persisted = JSON.parse((await AsyncStorage.getItem(APP_STORE_STORAGE_KEY)) as string) as {
      state: Record<string, unknown>;
    };
    expect(persisted.state).not.toHaveProperty('lastMapRegion');
  });
});
