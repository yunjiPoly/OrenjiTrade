/**
 * The scene-based life cycle on iOS, for the card scan's own development app only
 * (`ORENJI_APP_VARIANT=scan`, app.config.ts).
 *
 * An app built with the iOS 27 SDK (Xcode 27) stops at launch on iOS 27 unless it adopts the
 * scene life cycle (UIKit's `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`).
 * Expo SDK 57's native template does not; SDK 58's does, with `ExpoAppSceneDelegate`, which the
 * installed `expo` package already ships. This plugin makes the generated project do the same:
 *
 * - Info.plist declares one window scene whose delegate is Expo's `ExpoAppSceneDelegate`
 *   (Objective-C name `EXExpoAppSceneDelegate`); it creates the window and starts React Native;
 * - the AppDelegate provides the React Native factory (`ExpoReactNativeFactoryProvider`) and no
 *   longer creates a window of its own.
 *
 * Without the variable nothing changes. The future phone-install task decides whether every build
 * takes it (or moves to SDK 58's template).
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

const DECLARATION = 'class AppDelegate: ExpoAppDelegate {';
const PROVIDER_DECLARATION = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
const WINDOW_START =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([^)]*\)\s*#endif/;

function adoptScenesInAppDelegate(contents) {
  if (contents.includes(PROVIDER_DECLARATION)) {
    return contents;
  }
  if (!contents.includes(DECLARATION) || !WINDOW_START.test(contents)) {
    throw new Error(
      'withIosSceneLifecycle: the AppDelegate is not the one of Expo SDK 57; adopt the scene life cycle by hand.'
    );
  }
  return contents
    .replace(DECLARATION, PROVIDER_DECLARATION)
    .replace(
      WINDOW_START,
      '    // The window is created and React Native started by ExpoAppSceneDelegate (scene life cycle).'
    );
}

function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (plist) => {
    plist.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE,
          },
        ],
      },
    };
    return plist;
  });
  return withAppDelegate(config, (delegate) => {
    if (delegate.modResults.language !== 'swift') {
      throw new Error('withIosSceneLifecycle: expected a Swift AppDelegate.');
    }
    delegate.modResults.contents = adoptScenesInAppDelegate(delegate.modResults.contents);
    return delegate;
  });
}

module.exports = withIosSceneLifecycle;
module.exports.adoptScenesInAppDelegate = adoptScenesInAppDelegate;
