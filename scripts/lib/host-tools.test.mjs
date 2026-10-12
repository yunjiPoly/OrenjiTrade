// Unit tests of the per-platform host tool helpers (node --test; npm run test:scripts): the Android
// SDK location, the Maestro / emulator / Terraform hints, the platform choice of the native suite,
// the dedicated iOS simulator and the Python choice for the ML tests.
// Every platform is exercised on any machine; nothing here runs adb, xcrun, maestro, terraform or
// python.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  IOS_SIMULATOR_NAME,
  MAESTRO_PLATFORM_ENV,
  ML_PYTHON_MIN,
  adbCandidates,
  androidEmulatorCommand,
  androidSdkDirs,
  chooseIphoneType,
  chooseMaestroPlatform,
  chooseMlPython,
  defaultsValueMatches,
  defaultsWriteArgs,
  findIosSimulator,
  iosSimulatorDefaults,
  iosSimulatorUnavailableMessage,
  maestroNotFoundMessage,
  maestroTarget,
  mlPythonMissingMessage,
  mlVenvCommands,
  mlVenvInstallCommands,
  mlVenvPython,
  newestIosRuntime,
  noAndroidDeviceMessage,
  parseMaestroPlatform,
  parsePythonVersion,
  passwordAutofillPlists,
  pythonCommands,
  pythonIsSupported,
  splitPlatformArgs,
  terraformInstallHint,
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

describe('Maestro platform choice', () => {
  const never = () => {
    throw new Error('not probed');
  };

  it('reads --platform in both spellings and leaves the other arguments alone', () => {
    assert.deepEqual(splitPlatformArgs(['--platform', 'ios', '--keep-running', 'a.yaml']), {
      platform: 'ios',
      rest: ['--keep-running', 'a.yaml'],
    });
    assert.deepEqual(splitPlatformArgs(['a.yaml', '--platform=Android']), { platform: 'android', rest: ['a.yaml'] });
    assert.deepEqual(splitPlatformArgs(['--stop']), { platform: null, rest: ['--stop'] });
    // The last one wins.
    assert.equal(splitPlatformArgs(['--platform', 'ios', '--platform=android']).platform, 'android');
  });

  it('refuses a missing or unknown platform instead of running another one', () => {
    assert.throws(() => splitPlatformArgs(['--platform']), /needs a value \(android or ios\)/);
    assert.throws(() => splitPlatformArgs(['--platform', '--keep-running']), /needs a value/);
    assert.throws(() => splitPlatformArgs(['--platform=']), /needs a value/);
    assert.throws(() => splitPlatformArgs(['--platform', 'iphone']), /"iphone" is not a platform of the native suite/);
    assert.throws(() => parseMaestroPlatform('web', MAESTRO_PLATFORM_ENV), /ORENJI_MAESTRO_PLATFORM: "web"/);
    assert.equal(parseMaestroPlatform('  IOS '), 'ios');
    assert.equal(parseMaestroPlatform(''), null);
    assert.equal(parseMaestroPlatform(undefined), null);
  });

  it('an explicit choice is taken without probing any device: the flag, then the variable', () => {
    const base = { hostPlatform: 'darwin', androidDeviceReady: never, xcodeReady: never };
    assert.deepEqual(chooseMaestroPlatform({ ...base, flag: 'ios', env: { [MAESTRO_PLATFORM_ENV]: 'android' } }), {
      platform: 'ios',
      explicit: true,
      why: '--platform',
    });
    assert.deepEqual(chooseMaestroPlatform({ ...base, flag: null, env: { [MAESTRO_PLATFORM_ENV]: 'IOS' } }), {
      platform: 'ios',
      explicit: true,
      why: MAESTRO_PLATFORM_ENV,
    });
    assert.throws(
      () => chooseMaestroPlatform({ ...base, flag: null, env: { [MAESTRO_PLATFORM_ENV]: 'pixel' } }),
      /ORENJI_MAESTRO_PLATFORM: "pixel" is not a platform/,
    );
  });

  it('without a choice: Android when a device is ready, else iOS on a Mac with Xcode, else Android', () => {
    const choose = (hostPlatform, android, xcode) =>
      chooseMaestroPlatform({ flag: null, env: {}, hostPlatform, androidDeviceReady: () => android, xcodeReady: () => xcode });
    // A ready Android device wins everywhere: xcrun is not even asked.
    assert.equal(
      chooseMaestroPlatform({ flag: null, env: {}, hostPlatform: 'darwin', androidDeviceReady: () => true, xcodeReady: never }).platform,
      'android',
    );
    assert.deepEqual(choose('darwin', false, true), {
      platform: 'ios',
      explicit: false,
      why: 'no Android device is ready and this Mac has Xcode with an iOS runtime',
    });
    // A Mac without Xcode, Windows and Linux fall back to Android (the caller explains what is missing).
    assert.equal(choose('darwin', false, false).platform, 'android');
    assert.equal(choose('win32', false, true).platform, 'android');
    assert.equal(choose('linux', false, true).platform, 'android');
  });

  it('Android keeps its app id, 10.0.2.2 and the exp:// URL it always had', () => {
    assert.deepEqual(maestroTarget('android', { metroPort: 8082, apiPort: 8090, authEmulatorPort: 9099 }), {
      platform: 'android',
      label: 'Android',
      appId: 'host.exp.exponent',
      host: '10.0.2.2',
      appUrl: 'exp://10.0.2.2:8082',
      apiBaseUrl: 'http://10.0.2.2:8090',
      authEmulatorHost: '10.0.2.2:9099',
    });
  });

  it('iOS: Expo Go has a capital E in its bundle identifier and the Mac is localhost', () => {
    assert.deepEqual(maestroTarget('ios', { metroPort: 8082, apiPort: 8090, authEmulatorPort: 9099 }), {
      platform: 'ios',
      label: 'iOS',
      appId: 'host.exp.Exponent',
      host: 'localhost',
      appUrl: 'exp://127.0.0.1:8082',
      apiBaseUrl: 'http://localhost:8090',
      authEmulatorHost: 'localhost:9099',
    });
  });
});

describe('dedicated iOS simulator', () => {
  const type = (name, productFamily = 'iPhone') => ({
    name,
    productFamily,
    identifier: `com.apple.CoreSimulator.SimDeviceType.${name.replace(/[ ()]/g, '-')}`,
  });
  // What `xcrun simctl list runtimes -j` lists for iOS 27 on the owner's Mac (2026-10-10), shortened.
  const IOS_27_TYPES = [
    type('iPhone 18 Pro'),
    type('iPhone 18 Pro Max'),
    type('iPhone 17 Pro'),
    type('iPhone 17e'),
    type('iPhone Air'),
    type('iPhone 17'),
    type('iPhone 16'),
    type('iPhone 16 Plus'),
    type('iPhone SE (3rd generation)'),
    type('iPad Pro 13-inch (M5)', 'iPad'),
  ];

  it('takes the newest available iOS runtime, by version and not by text order', () => {
    const runtimes = [
      { platform: 'iOS', version: '26.4', identifier: 'ios-26-4', isAvailable: true },
      { platform: 'iOS', version: '27.0', identifier: 'ios-27-0', isAvailable: true },
      { platform: 'iOS', version: '9.3', identifier: 'ios-9-3', isAvailable: true },
      { platform: 'iOS', version: '28.0', identifier: 'ios-28-0', isAvailable: false },
      { platform: 'watchOS', version: '30.0', identifier: 'watchos-30', isAvailable: true },
    ];
    assert.equal(newestIosRuntime(runtimes).identifier, 'ios-27-0');
    assert.equal(newestIosRuntime([{ platform: 'iOS', version: '26.10', identifier: 'b' }, { platform: 'iOS', version: '26.9', identifier: 'a' }]).identifier, 'b');
    assert.equal(newestIosRuntime([{ platform: 'tvOS', version: '27.0' }]), null);
    assert.equal(newestIosRuntime(undefined), null);
  });

  it('creates a current standard iPhone: the newest numbered model, then the newest Pro', () => {
    assert.equal(chooseIphoneType(IOS_27_TYPES).name, 'iPhone 17');
    assert.equal(chooseIphoneType([type('iPhone 18 Pro'), type('iPhone 17 Pro'), type('iPhone Air')]).name, 'iPhone 18 Pro');
    assert.equal(chooseIphoneType([type('iPhone Air'), type('iPad (A16)', 'iPad')]).name, 'iPhone Air');
    assert.equal(chooseIphoneType([type('iPad (A16)', 'iPad')]), null);
    assert.equal(chooseIphoneType(undefined), null);
  });

  it('takes the model the developer names, by name or by identifier, and nothing else', () => {
    assert.equal(chooseIphoneType(IOS_27_TYPES, 'iphone 18 pro').name, 'iPhone 18 Pro');
    assert.equal(chooseIphoneType(IOS_27_TYPES, 'com.apple.CoreSimulator.SimDeviceType.iPhone-Air').name, 'iPhone Air');
    assert.equal(chooseIphoneType(IOS_27_TYPES, 'iPhone 99'), null);
    // Never an iPad: the app is a phone app and the flows are written for one.
    assert.equal(chooseIphoneType(IOS_27_TYPES, 'iPad Pro 13-inch (M5)'), null);
  });

  it("finds the dedicated simulator by name, never a developer's own simulator", () => {
    const devices = {
      'ios-26-4': [{ name: IOS_SIMULATOR_NAME, udid: 'OLD', state: 'Shutdown', isAvailable: true }],
      'ios-27-0': [
        { name: 'iPhone 17', udid: 'OWN-1', state: 'Booted', isAvailable: true },
        { name: IOS_SIMULATOR_NAME, udid: 'NEW', state: 'Shutdown', isAvailable: true },
      ],
    };
    assert.equal(IOS_SIMULATOR_NAME, 'OrenjiTrade Maestro');
    const found = findIosSimulator(devices, { name: IOS_SIMULATOR_NAME, runtimeIdentifier: 'ios-27-0' });
    assert.equal(found.udid, 'NEW');
    assert.equal(found.runtimeIdentifier, 'ios-27-0');
    // Only an older runtime has one: it is still the dedicated device.
    assert.equal(findIosSimulator(devices, { name: IOS_SIMULATOR_NAME, runtimeIdentifier: 'ios-28-0' }).udid, 'OLD');
    assert.equal(findIosSimulator(devices, { name: 'Another name', runtimeIdentifier: 'ios-27-0' }), null);
    assert.equal(findIosSimulator({}, { name: IOS_SIMULATOR_NAME }), null);
  });

  it('a simulator that became unavailable (its runtime was removed) is not the dedicated one', () => {
    const devices = { 'ios-26-4': [{ name: IOS_SIMULATOR_NAME, udid: 'GONE', isAvailable: false }] };
    assert.equal(findIosSimulator(devices, { name: IOS_SIMULATOR_NAME }), null);
  });

  it('a UDID names one simulator whatever it is called', () => {
    const devices = { 'ios-27-0': [{ name: 'iPhone 17', udid: 'ABCD-12', state: 'Shutdown', isAvailable: true }] };
    assert.equal(findIosSimulator(devices, { udid: ' abcd-12 ', name: IOS_SIMULATOR_NAME }).name, 'iPhone 17');
    assert.equal(findIosSimulator(devices, { udid: 'FFFF', name: 'iPhone 17' }), null);
  });

  it('the password AutoFill switch lives in the simulator data directory, never in the Mac settings', () => {
    const data = '/Users/collector/Library/Developer/CoreSimulator/Devices/UDID/data';
    const files = passwordAutofillPlists(data);
    assert.equal(files.length, 4);
    for (const file of files) {
      assert.ok(file.startsWith(`${data}/`), file);
      assert.match(file, /UserSettings\.plist$/);
    }
    assert.ok(files.some((file) => file.includes('systemgroup.com.apple.configurationprofiles')));
    assert.ok(files.some((file) => file.endsWith('UserConfigurationProfiles/EffectiveUserSettings.plist')));
  });

  it('the simulator speaks US English, types plainly and opens exp:// links in Expo Go', () => {
    const defaults = iosSimulatorDefaults('host.exp.Exponent');
    const value = (key) => defaults.find((entry) => entry.key === key);
    assert.deepEqual(value('AppleLanguages'), { domain: '-g', key: 'AppleLanguages', type: 'array', value: ['en-US'], restart: true });
    assert.equal(value('AppleLocale').value, 'en_US');
    assert.equal(value('KeyboardAutocorrection').value, false);
    assert.equal(value('DidShowContinuousPathIntroduction').value, true);
    const link = value('com.apple.CoreSimulator.CoreSimulatorBridge-->exp');
    assert.equal(link.domain, 'com.apple.launchservices.schemeapproval');
    assert.equal(link.value, 'host.exp.Exponent');
    assert.equal(link.restart, false);
    // Every preference is a `defaults write` inside the simulator: a bool, a string or an array.
    for (const entry of defaults) {
      assert.ok(['bool', 'string', 'array'].includes(entry.type), entry.key);
    }
  });

  it('builds `defaults write` arguments and recognises a value that is already set', () => {
    assert.deepEqual(defaultsWriteArgs({ domain: 'com.apple.Preferences', key: 'KeyboardPrediction', type: 'bool', value: false }), [
      'write',
      'com.apple.Preferences',
      'KeyboardPrediction',
      '-bool',
      'NO',
    ]);
    assert.deepEqual(defaultsWriteArgs({ domain: '-g', key: 'AppleLanguages', type: 'array', value: ['en-US'] }), [
      'write',
      '-g',
      'AppleLanguages',
      '-array',
      'en-US',
    ]);
    assert.deepEqual(defaultsWriteArgs({ domain: '-g', key: 'AppleLocale', type: 'string', value: 'en_US' }).slice(3), ['-string', 'en_US']);

    assert.equal(defaultsValueMatches({ type: 'bool', value: false }, '0\n'), true);
    assert.equal(defaultsValueMatches({ type: 'bool', value: true }, '0\n'), false);
    assert.equal(defaultsValueMatches({ type: 'string', value: 'en_US' }, 'en_US\n'), true);
    assert.equal(defaultsValueMatches({ type: 'string', value: 'en_US' }, 'en_US@rg=cazzzz\n'), false);
    // What `defaults read -g AppleLanguages` prints.
    assert.equal(defaultsValueMatches({ type: 'array', value: ['en-US'] }, '(\n    "en-US"\n)\n'), true);
    assert.equal(
      defaultsValueMatches({ type: 'array', value: ['en-US'] }, '(\n    "en-US",\n    "en-CA",\n    en,\n    "fr-CA"\n)\n'),
      false,
    );
    assert.equal(defaultsValueMatches({ type: 'array', value: ['en-US', 'en'] }, '(\n    "en-US",\n    en\n)\n'), true);
  });

  it('says why the simulator cannot be used: not a Mac, or what is missing in Xcode', () => {
    assert.match(iosSimulatorUnavailableMessage({ hostPlatform: 'win32', reason: 'x' }), /only exists on macOS.*--platform android/);
    const mac = iosSimulatorUnavailableMessage({ hostPlatform: 'darwin', reason: 'no iOS simulator runtime is installed' });
    assert.match(mac, /no iOS simulator runtime is installed/);
    assert.match(mac, /macos-setup\.md section 9\.2/);
  });
});

describe('Terraform install hint', () => {
  it('macOS uses the HashiCorp tap (homebrew-core no longer has the formula)', () => {
    assert.equal(terraformInstallHint('darwin'), 'brew tap hashicorp/tap && brew install hashicorp/tap/terraform');
    assert.doesNotMatch(terraformInstallHint('darwin'), /brew install terraform/);
  });

  it('Windows uses winget, Linux points at the install page', () => {
    assert.equal(terraformInstallHint('win32'), 'winget install Hashicorp.Terraform');
    assert.match(terraformInstallHint('linux'), /^https:\/\/developer\.hashicorp\.com\/terraform\/install$/);
  });
});

describe('Python for the ML tests', () => {
  it('parses `python --version`', () => {
    assert.deepEqual(parsePythonVersion('Python 3.9.6\n'), [3, 9, 6]);
    assert.deepEqual(parsePythonVersion('Python 3.12.7'), [3, 12, 7]);
    assert.deepEqual(parsePythonVersion('Python 3.13'), [3, 13, 0]);
    assert.deepEqual(parsePythonVersion('\nPython 3.14.0rc1'), [3, 14, 0]);
    assert.equal(parsePythonVersion('zsh: command not found: python'), null);
    assert.equal(parsePythonVersion(undefined), null);
  });

  it('needs Python 3.12 or newer', () => {
    assert.deepEqual([...ML_PYTHON_MIN], [3, 12]);
    assert.equal(pythonIsSupported([3, 12, 0]), true);
    assert.equal(pythonIsSupported([3, 13, 1]), true);
    assert.equal(pythonIsSupported([4, 0, 0]), true);
    assert.equal(pythonIsSupported([3, 11, 9]), false);
    assert.equal(pythonIsSupported([3, 9, 6]), false);
    assert.equal(pythonIsSupported([2, 7, 18]), false);
    assert.equal(pythonIsSupported(null), false);
  });

  it('the virtual environment interpreter is bin/python, Scripts\\python.exe on Windows', () => {
    assert.equal(mlVenvPython('/repo/apps/ml', 'darwin'), '/repo/apps/ml/.venv/bin/python');
    assert.equal(mlVenvPython('/repo/apps/ml', 'linux'), '/repo/apps/ml/.venv/bin/python');
    assert.equal(mlVenvPython('C:\\repo\\apps\\ml', 'win32'), 'C:\\repo\\apps\\ml\\.venv\\Scripts\\python.exe');
  });

  it('tries versioned interpreter names after python3 on macOS and Linux, python3.12 (CI) first', () => {
    assert.deepEqual(pythonCommands('win32'), ['python', 'py']);
    for (const platform of ['darwin', 'linux']) {
      assert.deepEqual(pythonCommands(platform), ['python3', 'python', 'python3.12', 'python3.13', 'python3.14']);
    }
  });

  it('skips the macOS Command Line Tools Python 3.9 and takes Homebrew python3.12', () => {
    const found = [
      { python: 'python3', source: 'python3 on PATH', version: [3, 9, 6] },
      { python: 'python3.12', source: 'python3.12 on PATH', version: [3, 12, 7] },
    ];
    const { chosen, tooOld } = chooseMlPython(found);
    assert.equal(chosen.python, 'python3.12');
    assert.deepEqual(
      tooOld.map((candidate) => candidate.python),
      ['python3'],
    );
  });

  it('prefers the first supported interpreter and reports when none is', () => {
    const venv = { python: '/repo/apps/ml/.venv/bin/python', source: 'apps/ml/.venv', version: [3, 12, 7] };
    assert.equal(chooseMlPython([venv, { python: 'python3', source: 'python3 on PATH', version: [3, 13, 0] }]).chosen, venv);
    const none = chooseMlPython([{ python: 'python3', source: 'python3 on PATH', version: [3, 9, 6] }]);
    assert.equal(none.chosen, null);
    assert.equal(none.tooOld.length, 1);
    assert.deepEqual(chooseMlPython([]), { chosen: null, tooOld: [] });
  });

  it('prints the virtual environment commands of the platform', () => {
    assert.equal(
      mlVenvCommands('darwin', 'python3.12'),
      'cd apps/ml && python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt',
    );
    assert.equal(
      mlVenvCommands('win32', 'python'),
      'cd apps\\ml && python -m venv .venv && .venv\\Scripts\\pip install -r requirements.txt -r requirements-dev.txt',
    );
    assert.doesNotMatch(mlVenvCommands('linux', 'python3'), /Scripts/);
    // An existing virtual environment only needs the requirements.
    assert.equal(mlVenvInstallCommands('darwin'), 'cd apps/ml && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt');
    assert.equal(
      mlVenvInstallCommands('win32'),
      'cd apps\\ml && .venv\\Scripts\\pip install -r requirements.txt -r requirements-dev.txt',
    );
  });

  it('says which Python was found and that it is too old (macOS without a venv)', () => {
    const message = mlPythonMissingMessage({
      platform: 'darwin',
      tooOld: [{ python: 'python3', source: 'python3 on PATH', version: [3, 9, 6] }],
    });
    assert.match(message, /Python 3\.12\+ not found: python3 on PATH is Python 3\.9\.6\./);
    assert.match(message, /brew install python@3\.12/);
    assert.match(message, /python3\.12 -m venv \.venv && \.venv\/bin\/pip install/);
    assert.doesNotMatch(message, /Scripts/);
  });

  it('says so when the virtual environment itself is too old, or when there is no Python at all', () => {
    const stale = mlPythonMissingMessage({
      platform: 'darwin',
      tooOld: [{ python: '/repo/apps/ml/.venv/bin/python', source: 'apps/ml/.venv', version: [3, 9, 6] }],
    });
    assert.match(stale, /apps\/ml\/\.venv uses Python 3\.9\.6, but apps\/ml needs Python 3\.12\+/);
    assert.match(stale, /Delete apps\/ml\/\.venv and create it again/);

    const windows = mlPythonMissingMessage({ platform: 'win32', tooOld: [] });
    assert.match(windows, /no apps\/ml\/\.venv and no Python on PATH/);
    assert.match(windows, /winget install Python\.Python\.3\.12/);
    assert.match(windows, /\.venv\\Scripts\\pip install/);

    assert.match(mlPythonMissingMessage({ platform: 'linux', tooOld: [] }), /your package manager/);
  });
});
