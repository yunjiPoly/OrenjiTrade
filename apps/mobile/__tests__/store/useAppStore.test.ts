import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_STORE_STORAGE_KEY, DEFAULT_PREFS, useAppStore } from '@/src/store/useAppStore';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useAppStore', () => {
  beforeEach(async () => {
    useAppStore.getState().reset();
    await AsyncStorage.clear();
  });

  it('starts with system theme, default prefs and no map region', () => {
    const state = useAppStore.getState();
    expect(state.themeOverride).toBe('system');
    expect(state.prefs).toEqual(DEFAULT_PREFS);
    expect(state.lastMapRegion).toBeNull();
  });

  it('updates the theme override', () => {
    useAppStore.getState().setThemeOverride('dark');
    expect(useAppStore.getState().themeOverride).toBe('dark');
  });

  it('merges preference patches without dropping other keys', () => {
    useAppStore.getState().updatePrefs({ distanceUnit: 'mi' });
    useAppStore.getState().updatePrefs({ lastSignedInEmail: 'ayumi@example.test' });
    expect(useAppStore.getState().prefs).toEqual({
      distanceUnit: 'mi',
      hasCompletedOnboarding: false,
      lastSignedInEmail: 'ayumi@example.test',
    });
  });

  it('remembers the last map region and can clear it', () => {
    const region = {
      latitude: 45.5017,
      longitude: -73.5673,
      latitudeDelta: 0.1,
      longitudeDelta: 0.1,
    };
    useAppStore.getState().setLastMapRegion(region);
    expect(useAppStore.getState().lastMapRegion).toEqual(region);
    useAppStore.getState().setLastMapRegion(null);
    expect(useAppStore.getState().lastMapRegion).toBeNull();
  });

  it('resets to the initial state', () => {
    useAppStore.getState().setThemeOverride('light');
    useAppStore.getState().updatePrefs({ hasCompletedOnboarding: true });
    useAppStore.getState().reset();
    expect(useAppStore.getState().themeOverride).toBe('system');
    expect(useAppStore.getState().prefs).toEqual(DEFAULT_PREFS);
  });

  it('persists only the whitelisted slice to AsyncStorage', async () => {
    useAppStore.getState().setThemeOverride('dark');
    await flush();
    const raw = await AsyncStorage.getItem(APP_STORE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string) as {
      state: Record<string, unknown>;
      version: number;
    };
    expect(persisted.version).toBe(1);
    expect(persisted.state).toEqual({
      themeOverride: 'dark',
      prefs: DEFAULT_PREFS,
      lastMapRegion: null,
    });
    expect(Object.keys(persisted.state)).not.toContain('setThemeOverride');
  });
});
