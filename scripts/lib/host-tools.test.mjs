// Unit tests of the per-platform host tool helpers (node --test; npm run test:scripts): the Android
// SDK location and the Maestro / emulator hints. Every platform is exercised on any machine;
// nothing here runs adb or maestro.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adbCandidates,
  androidEmulatorCommand,
  androidSdkDirs,
  maestroNotFoundMessage,
  noAndroidDeviceMessage,
} from './host-tools.mjs';

const MAC_HOME = '/Users/collector';
const LINUX_HOME = '/home/collector';

describe('Android SDK location', () => {
  it('macOS: looks in ~/Library/Android/sdk (Android Studio default), then the Linux-style folder', () => {
    assert.deepEqual(adbCandidates({ platform: 'darwin', env: {}, home: MAC_HOME }), [
      '/Users/collector/Library/Android/sdk/platform-tools/adb',
      '/Users/collector/Android/Sdk/platform-tools/adb',
    ]);
  });

  it('Linux: ~/Android/Sdk, never the macOS Library folder', () => {
    assert.deepEqual(adbCandidates({ platform: 'linux', env: {}, home: LINUX_HOME }), [
      '/home/collector/Android/Sdk/platform-tools/adb',
    ]);
  });

  it('Windows: %LOCALAPPDATA%\\Android\\Sdk with adb.exe, and nothing when LOCALAPPDATA is unset', () => {
    assert.deepEqual(
      adbCandidates({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\collector\\AppData\\Local' }, home: 'C:\\Users\\collector' }),
      ['C:\\Users\\collector\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe'],
    );
    assert.deepEqual(adbCandidates({ platform: 'win32', env: {}, home: 'C:\\Users\\collector' }), []);
  });

  it('ANDROID_HOME and ANDROID_SDK_ROOT come first, without duplicates', () => {
    const env = { ANDROID_HOME: '/opt/android', ANDROID_SDK_ROOT: '/Users/collector/Library/Android/sdk' };
    assert.deepEqual(androidSdkDirs({ platform: 'darwin', env, home: MAC_HOME }), [
      '/opt/android',
      '/Users/collector/Library/Android/sdk',
      '/Users/collector/Android/Sdk',
    ]);
    assert.equal(adbCandidates({ platform: 'darwin', env, home: MAC_HOME })[0], '/opt/android/platform-tools/adb');
  });
});

describe('Android and Maestro hints', () => {
  it('the emulator example matches the platform', () => {
    assert.match(androidEmulatorCommand('win32'), /^%LOCALAPPDATA%\/Android\/Sdk\/emulator\/emulator -avd /);
    assert.match(androidEmulatorCommand('darwin'), /^~\/Library\/Android\/sdk\/emulator\/emulator -avd /);
    assert.match(androidEmulatorCommand('linux'), /^~\/Android\/Sdk\/emulator\/emulator -avd /);
  });

  it('a Mac never gets Windows paths in the "no device" message', () => {
    const message = noAndroidDeviceMessage({ platform: 'darwin', adb: '/Users/collector/Library/Android/sdk/platform-tools/adb' });
    assert.match(message, /No Android device is ready/);
    assert.match(message, /~\/Library\/Android\/sdk\/emulator\/emulator/);
    assert.doesNotMatch(message, /LOCALAPPDATA|\.bat|\.exe|D:\//);
    // adb was found: the SDK is installed, only the emulator is missing.
    assert.doesNotMatch(message, /adb was not found/);
  });

  it('says that the SDK itself is missing when only bare `adb` is left', () => {
    const mac = noAndroidDeviceMessage({ platform: 'darwin', adb: 'adb' });
    assert.match(mac, /adb was not found in ANDROID_HOME, ANDROID_SDK_ROOT or ~\/Library\/Android\/sdk/);
    assert.match(mac, /set ANDROID_HOME/);
    assert.match(noAndroidDeviceMessage({ platform: 'win32', adb: 'adb' }), /%LOCALAPPDATA%\/Android\/Sdk/);
    assert.match(noAndroidDeviceMessage({ platform: 'linux', adb: 'adb' }), /or ~\/Android\/Sdk/);
  });

  it('the Maestro hint names maestro.bat only on Windows', () => {
    assert.match(maestroNotFoundMessage('win32'), /MAESTRO_BIN \(e\.g\. D:\/maestro\/bin\/maestro\.bat\)/);
    for (const platform of ['darwin', 'linux']) {
      const message = maestroNotFoundMessage(platform);
      assert.match(message, /~\/\.maestro\/bin/);
      assert.match(message, /MAESTRO_BIN \(e\.g\. \$HOME\/\.maestro\/bin\/maestro\)/);
      assert.doesNotMatch(message, /\.bat|D:\//);
    }
  });
});
