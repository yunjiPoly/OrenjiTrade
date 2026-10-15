/**
 * The scan app's scene life cycle plugin (plugins/withIosSceneLifecycle.js), run through its real
 * config mods: Info.plist declares one window scene whose delegate is Expo's scene delegate, and
 * Expo SDK 57's generated AppDelegate provides the React Native factory to it and creates no window
 * of its own; an AppDelegate it does not know is refused.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';

type Mod = (config: Record<string, unknown>) => Promise<Record<string, unknown>>;
type PluginConfig = { name: string; slug: string; mods?: { ios?: Record<string, Mod> } };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../../plugins/withIosSceneLifecycle') as ((
  config: PluginConfig
) => PluginConfig) & { adoptScenesInAppDelegate: (contents: string) => string };
const { adoptScenesInAppDelegate } = plugin;

/** The parts of Expo SDK 57's template (expo-template-bare-minimum 57.0.31) the plugin edits. */
const SDK_57_APP_DELEGATE = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

/** The Objective-C name of Expo's scene delegate (the `expo` package's ExpoAppSceneDelegate). */
const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

/** Runs one iOS mod the plugin registered on `modResults`, as `expo prebuild` does. */
async function runIosMod(mod: string, modResults: unknown) {
  const config = plugin({ name: 'OrenjiTrade Scan', slug: 'orenjitrade' });
  const run = config.mods?.ios?.[mod];
  expect(run).toBeInstanceOf(Function);
  const result = await run!({ ...config, modResults, modRequest: { platform: 'ios' } });
  return result.modResults;
}

describe('the scene life cycle of the scan app', () => {
  it("declares one window scene in Info.plist whose delegate is Expo's scene delegate", async () => {
    const plist = (await runIosMod('infoPlist', {
      CFBundleDisplayName: 'OrenjiTrade Scan',
      ITSAppUsesNonExemptEncryption: false,
    })) as Record<string, unknown>;
    expect(plist.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE,
          },
        ],
      },
    });
    // The other keys stay as they were.
    expect(plist.CFBundleDisplayName).toBe('OrenjiTrade Scan');
    expect(plist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('names a scene delegate and a provider protocol the installed expo package has', () => {
    const ios = join(dirname(require.resolve('expo/package.json')), 'ios', 'AppDelegates');
    expect(readFileSync(join(ios, 'ExpoAppSceneDelegate.swift'), 'utf8')).toContain(
      `@objc(${SCENE_DELEGATE})`
    );
    expect(readFileSync(join(ios, 'ExpoReactNativeFactoryProvider.swift'), 'utf8')).toContain(
      'public protocol ExpoReactNativeFactoryProvider'
    );
  });

  it('rewrites the Swift AppDelegate through its mod and refuses another language', async () => {
    const delegate = (await runIosMod('appDelegate', {
      language: 'swift',
      contents: SDK_57_APP_DELEGATE,
    })) as { contents: string };
    expect(delegate.contents).toBe(adoptScenesInAppDelegate(SDK_57_APP_DELEGATE));
    await expect(runIosMod('appDelegate', { language: 'objcpp', contents: '' })).rejects.toThrow(
      /expected a Swift AppDelegate/
    );
  });

  it('lets the scene delegate create the window and start React Native', () => {
    const adopted = adoptScenesInAppDelegate(SDK_57_APP_DELEGATE);
    expect(adopted).toContain(
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
    );
    expect(adopted).not.toContain('window = UIWindow(');
    expect(adopted).not.toContain('factory.startReactNative(');
    expect(adopted).toContain('reactNativeFactory = factory');
    expect(adopted).toContain('return super.application(');
  });

  it('changes nothing the second time', () => {
    const adopted = adoptScenesInAppDelegate(SDK_57_APP_DELEGATE);
    expect(adoptScenesInAppDelegate(adopted)).toBe(adopted);
  });

  it('refuses an AppDelegate it does not know', () => {
    expect(() => adoptScenesInAppDelegate('class AppDelegate: UIResponder {}')).toThrow(
      /adopt the scene life cycle by hand/
    );
  });
});
