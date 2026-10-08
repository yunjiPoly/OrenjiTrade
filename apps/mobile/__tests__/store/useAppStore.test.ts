import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_STORE_STORAGE_KEY, DEFAULT_PREFS, useAppStore } from '@/src/store/useAppStore';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useAppStore', () => {
  beforeEach(async () => {
    useAppStore.getState().reset();
    await AsyncStorage.clear();
  });

  it('starts with system theme and default prefs', () => {
    const state = useAppStore.getState();
    expect(state.themeOverride).toBe('system');
    expect(state.prefs).toEqual(DEFAULT_PREFS);
  });

  it('updates the theme override', () => {
    useAppStore.getState().setThemeOverride('dark');
    expect(useAppStore.getState().themeOverride).toBe('dark');
  });

  it('merges preference patches', () => {
    useAppStore.getState().updatePrefs({ lastSignedInEmail: 'ayumi@example.test' });
    expect(useAppStore.getState().prefs).toEqual({ lastSignedInEmail: 'ayumi@example.test' });
  });

  it('resets to the initial state', () => {
    useAppStore.getState().setThemeOverride('light');
    useAppStore.getState().updatePrefs({ lastSignedInEmail: 'x@example.test' });
    useAppStore.getState().reset();
    expect(useAppStore.getState().themeOverride).toBe('system');
    expect(useAppStore.getState().prefs).toEqual(DEFAULT_PREFS);
  });

  it('persists only the whitelisted slice (never a password or coordinates of the collector)', async () => {
    useAppStore.getState().setThemeOverride('dark');
    await flush();
    const raw = await AsyncStorage.getItem(APP_STORE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(persisted.version).toBe(4);
    expect(persisted.state).toEqual({ themeOverride: 'dark', prefs: DEFAULT_PREFS });
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
    expect(useAppStore.getState().prefs).toEqual({ lastSignedInEmail: 'old@example.test' });
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
