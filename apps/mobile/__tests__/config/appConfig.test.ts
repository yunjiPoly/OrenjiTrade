import appConfig from '@/app.config';

const DARK_BACKGROUND = '#141210';

describe('app.config', () => {
  it('shows a dark splash on every phone, like the first screen of a new install', () => {
    const config = appConfig({ config: {} } as Parameters<typeof appConfig>[0]);
    const splash = config.plugins?.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
    );
    expect(splash?.[1]).toMatchObject({
      backgroundColor: DARK_BACKGROUND,
      dark: { backgroundColor: DARK_BACKGROUND },
    });
    // "System" in Settings → Appearance still needs the phone's scheme.
    expect(config.userInterfaceStyle).toBe('automatic');
  });
});
