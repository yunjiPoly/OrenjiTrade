#!/usr/bin/env node
// Child process of the Maestro harness on iOS (scripts/lib/ios-simulator.mjs): makes sure ONE
// simulator, named by its UDID, has the Expo Go that fits the project's Expo SDK.
//
//   node scripts/lib/expo-go-ios.mjs <apps/mobile directory> <simulator UDID>
//
// `expo start --ios` cannot be used for this: it opens the project on the first booted simulator
// it finds (a developer's own one when it is booted) and brings the Simulator / DeviceHub window
// to the front. This script calls the same installer of Expo CLI (the Expo Go download from
// Expo's servers, cached in ~/.expo/ios-simulator-app-cache, then `xcrun simctl install`) with the
// device given to it, and opens nothing. It runs in its own process because it loads Expo CLI's
// internal modules: if a later Expo SDK moves them, the error below says what to do by hand.
//
// Prints one line of JSON on success: {"installed": true|false, "version": "<Expo Go version>"}
// (`installed` is false when the right Expo Go was already there).

import { createRequire } from 'node:module';
import path from 'node:path';

const EXPO_GO = 'host.exp.Exponent';
const [mobileDir, udid] = process.argv.slice(2);
if (!mobileDir || !udid) {
  console.error('Usage: node scripts/lib/expo-go-ios.mjs <apps/mobile directory> <simulator UDID>');
  process.exit(2);
}

const require = createRequire(path.join(path.resolve(mobileDir), 'package.json'));

function expoCliModule(file) {
  try {
    return require(`@expo/cli/build/src/${file}`);
  } catch (error) {
    throw new Error(
      `Expo CLI's module ${file} could not be loaded (${error.message}). This Expo SDK moved it: install ` +
        `Expo Go by hand with only this simulator booted (cd apps/mobile && npx expo start --ios), then rerun.`,
    );
  }
}

try {
  const { getConfig } = require('expo/config');
  const { exp } = getConfig(path.resolve(mobileDir), { skipSDKVersionRequirement: true });
  if (!exp.sdkVersion) {
    throw new Error('the Expo SDK version of apps/mobile could not be read');
  }
  const { AppleDeviceManager } = expoCliModule('start/platforms/ios/AppleDeviceManager');
  // Boots the device when it is not booted yet (the harness booted it already) and never picks
  // another one: `device.udid` is given.
  const manager = await AppleDeviceManager.resolveAsync({ device: { udid, osType: 'iOS' } });
  const installed = await manager.ensureExpoGoAsync(exp.sdkVersion);
  const version = await manager.getAppVersionAsync(EXPO_GO);
  console.log(JSON.stringify({ installed, version: version ?? null, sdkVersion: exp.sdkVersion }));
  process.exit(0);
} catch (error) {
  console.error(`Expo Go on the iOS simulator ${udid}: ${error.message}`);
  process.exit(1);
}
