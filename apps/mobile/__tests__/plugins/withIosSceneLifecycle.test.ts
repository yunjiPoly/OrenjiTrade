/**
 * The scan app's scene life cycle plugin (plugins/withIosSceneLifecycle.js): it turns Expo SDK
 * 57's generated AppDelegate into one that provides the React Native factory to Expo's scene
 * delegate and creates no window of its own, and refuses an AppDelegate it does not know.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { adoptScenesInAppDelegate } = require('../../plugins/withIosSceneLifecycle') as {
  adoptScenesInAppDelegate: (contents: string) => string;
};

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

describe('the scene life cycle of the scan app', () => {
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
