import appConfig from '@/app.config';

const DARK_BACKGROUND = '#141210';
const SCENE_PLUGIN = './plugins/withIosSceneLifecycle';

type AppConfig = typeof appConfig;
type ResolvedConfig = ReturnType<AppConfig>;

/**
 * app.config.ts read with `ORENJI_APP_VARIANT` set to `variant` (left out when undefined): the
 * module reads the variable once when it loads, so each case loads its own copy.
 */
function resolvedWith(variant: string | undefined): ResolvedConfig {
  const saved = process.env.ORENJI_APP_VARIANT;
  if (variant === undefined) {
    delete process.env.ORENJI_APP_VARIANT;
  } else {
    process.env.ORENJI_APP_VARIANT = variant;
  }
  try {
    let load: AppConfig | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      load = (require('@/app.config') as { default: AppConfig }).default;
    });
    return load!({ config: {} } as Parameters<AppConfig>[0]);
  } finally {
    if (saved === undefined) {
      delete process.env.ORENJI_APP_VARIANT;
    } else {
      process.env.ORENJI_APP_VARIANT = saved;
    }
  }
}

/** The config without the fields the scan variant may change. */
function withoutVariantFields(config: ResolvedConfig) {
  const { name: _name, ios, android, plugins, ...rest } = config;
  const { bundleIdentifier: _bundleIdentifier, ...iosRest } = ios ?? {};
  const { package: _package, ...androidRest } = android ?? {};
  return {
    ...rest,
    ios: iosRest,
    android: androidRest,
    plugins: (plugins ?? []).filter((plugin) => plugin !== SCENE_PLUGIN),
  };
}

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

describe('the app variant (ORENJI_APP_VARIANT)', () => {
  it("builds the owner's app when the variable is unset: its id, its name, no scene plugin", () => {
    const config = resolvedWith(undefined);
    expect(config.name).toBe('OrenjiTrade');
    expect(config.ios?.bundleIdentifier).toBe('com.orenjitrade.app');
    expect(config.android?.package).toBe('com.orenjitrade.app');
    expect(config.plugins).not.toContain(SCENE_PLUGIN);
  });

  it.each(['', ' ', '\t'])('treats a blank value (%j) as unset', (blank) => {
    expect(resolvedWith(blank)).toEqual(resolvedWith(undefined));
  });

  it.each(['scan', ' scan '])(
    'builds the scan app beside it with %j: its own id and name, the scene plugin',
    (scan) => {
      const config = resolvedWith(scan);
      expect(config.name).toBe('OrenjiTrade Scan');
      expect(config.ios?.bundleIdentifier).toBe('com.orenjitrade.app.scan');
      expect(config.android?.package).toBe('com.orenjitrade.app.scan');
      expect(config.plugins).toContain(SCENE_PLUGIN);
    }
  );

  it('changes nothing else for the scan app', () => {
    expect(withoutVariantFields(resolvedWith('scan'))).toEqual(
      withoutVariantFields(resolvedWith(undefined))
    );
  });

  it.each(['Scan', 'SCAN', 'scan2', 'prod', 'owner'])(
    "refuses any other value (%j), so a typo never builds the owner's id",
    (value) => {
      expect(() => resolvedWith(value)).toThrow(
        `ORENJI_APP_VARIANT must be "scan" or unset, not "${value}"`
      );
    }
  );
});
