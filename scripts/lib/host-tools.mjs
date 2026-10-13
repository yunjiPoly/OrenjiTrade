// Host tools the local scripts depend on, per operating system: where a tool is installed and what
// to tell the developer when it is missing. The scripts were written on Windows; these helpers give
// macOS and Linux their own paths and hints.
//
// Everything here is pure: the platform (`process.platform` values: win32, darwin, linux), the
// environment and the home directory are parameters, so host-tools.test.mjs checks every operating
// system on any machine.

import path from 'node:path';

const pathFor = (platform) => (platform === 'win32' ? path.win32 : path.posix);

// ------------------------------------------------------------------------------ Android

/**
 * Android SDK roots to look for adb in, most specific first: ANDROID_HOME, ANDROID_SDK_ROOT, then
 * where Android Studio installs the SDK on this platform (macOS: ~/Library/Android/sdk; Linux:
 * ~/Android/Sdk, also accepted on macOS; Windows: %LOCALAPPDATA%\Android\Sdk).
 */
export function androidSdkDirs({ platform, env, home }) {
  const p = pathFor(platform);
  const dirs = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT];
  if (platform === 'win32') {
    dirs.push(env.LOCALAPPDATA ? p.join(env.LOCALAPPDATA, 'Android', 'Sdk') : undefined);
  } else {
    if (platform === 'darwin') {
      dirs.push(p.join(home, 'Library', 'Android', 'sdk'));
    }
    dirs.push(p.join(home, 'Android', 'Sdk'));
  }
  return [...new Set(dirs.filter(Boolean))];
}

/** The adb binaries to try, in order (see androidSdkDirs); bare `adb` on PATH is the caller's last resort. */
export function adbCandidates({ platform, env, home }) {
  const p = pathFor(platform);
  const exe = platform === 'win32' ? 'adb.exe' : 'adb';
  return androidSdkDirs({ platform, env, home }).map((dir) => p.join(dir, 'platform-tools', exe));
}

/** An example command that starts an Android emulator on this platform. */
export function androidEmulatorCommand(platform) {
  if (platform === 'win32') {
    return '%LOCALAPPDATA%/Android/Sdk/emulator/emulator -avd Pixel_6_API_34 -no-snapshot-save -no-boot-anim';
  }
  const sdk = platform === 'darwin' ? '~/Library/Android/sdk' : '~/Android/Sdk';
  return `${sdk}/emulator/emulator -avd Pixel_6_API_35 -no-snapshot-save -no-boot-anim`;
}

/**
 * What to print when no Android device is ready. `adb` is the binary the harness resolved; the
 * bare name `adb` means no SDK was found, which is a different problem from a stopped emulator.
 */
export function noAndroidDeviceMessage({ platform, adb }) {
  const sdk = { win32: '%LOCALAPPDATA%/Android/Sdk', darwin: '~/Library/Android/sdk' }[platform] ?? '~/Android/Sdk';
  const lines = [
    `No Android device is ready. Start an emulator first, e.g. \`${androidEmulatorCommand(platform)}\` ` +
      '(`emulator -list-avds` lists yours), then wait until Android has booted ' +
      '(`adb shell getprop sys.boot_completed` prints 1).',
  ];
  if (adb === 'adb') {
    lines.push(
      `adb was not found in ANDROID_HOME, ANDROID_SDK_ROOT or ${sdk}, so \`adb\` on PATH was tried: ` +
        `install the Android SDK platform-tools, or set ANDROID_HOME when the SDK is somewhere else.`,
    );
  }
  return lines.join('\n');
}

/** What to print when the Maestro CLI is not found. */
export function maestroNotFoundMessage(platform) {
  if (platform === 'win32') {
    return 'Maestro CLI not found: set MAESTRO_BIN (e.g. D:/maestro/bin/maestro.bat) or put maestro on PATH.';
  }
  return (
    'Maestro CLI not found: put `maestro` on PATH, install it into ~/.maestro/bin (found automatically; ' +
    'docs/development/macos-setup.md section 9.4), or set MAESTRO_BIN (e.g. $HOME/.maestro/bin/maestro).'
  );
}

// --------------------------------------------------------------- Maestro: Android or iOS

/** The platforms `npm run test:mobile:maestro` can drive. */
export const MAESTRO_PLATFORMS = Object.freeze(['android', 'ios']);

/** The environment variable that chooses the platform (the `--platform` flag wins over it). */
export const MAESTRO_PLATFORM_ENV = 'ORENJI_MAESTRO_PLATFORM';

/** `android` / `ios` out of a flag or variable value (any letter case), null when empty; throws otherwise. */
export function parseMaestroPlatform(value, source = '--platform') {
  const wanted = String(value ?? '').trim().toLowerCase();
  if (!wanted) {
    return null;
  }
  if (!MAESTRO_PLATFORMS.includes(wanted)) {
    throw new Error(`${source}: "${value}" is not a platform of the native suite (use ${MAESTRO_PLATFORMS.join(' or ')}).`);
  }
  return wanted;
}

/**
 * Takes `--platform <name>` / `--platform=<name>` out of the arguments (the last one wins) and
 * returns `{ platform, rest }`; `platform` is null when the flag is absent. Throws on a missing or
 * unknown value, so a typo never silently runs the other platform.
 */
export function splitPlatformArgs(argv) {
  let platform = null;
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--platform') {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`--platform needs a value (${MAESTRO_PLATFORMS.join(' or ')}).`);
      }
      platform = parseMaestroPlatform(value);
      index += 1;
    } else if (arg.startsWith('--platform=')) {
      platform = parseMaestroPlatform(arg.slice('--platform='.length));
      if (!platform) {
        throw new Error(`--platform needs a value (${MAESTRO_PLATFORMS.join(' or ')}).`);
      }
    } else {
      rest.push(arg);
    }
  }
  return { platform, rest };
}

/**
 * Which platform a run drives. An explicit choice (the `--platform` flag, then
 * ORENJI_MAESTRO_PLATFORM) is taken as it is. Without one: Android when an Android device is ready
 * (what the suite has always run on), otherwise the iOS simulator on a Mac with Xcode, otherwise
 * Android again so the caller prints the "no Android device" help. `androidDeviceReady` and
 * `xcodeReady` are functions that answer true or false.
 * Returns `{ platform, explicit, why }`.
 */
export function chooseMaestroPlatform({ flag, env = {}, hostPlatform, androidDeviceReady, xcodeReady }) {
  const fromEnv = parseMaestroPlatform(env[MAESTRO_PLATFORM_ENV], MAESTRO_PLATFORM_ENV);
  if (flag) {
    return { platform: flag, explicit: true, why: '--platform' };
  }
  if (fromEnv) {
    return { platform: fromEnv, explicit: true, why: MAESTRO_PLATFORM_ENV };
  }
  // The probes are functions: adb and xcrun only run when the answer depends on them.
  if (androidDeviceReady()) {
    return { platform: 'android', explicit: false, why: 'an Android device is ready' };
  }
  if (hostPlatform === 'darwin' && xcodeReady()) {
    return { platform: 'ios', explicit: false, why: 'no Android device is ready and this Mac has Xcode with an iOS runtime' };
  }
  return { platform: 'android', explicit: false, why: 'the default' };
}

/**
 * What the app and the flows need to know about a platform:
 * - `appId`: Expo Go's application id (Android package, iOS bundle identifier; they differ by one
 *   capital letter);
 * - `host`: the development machine as the device sees it. The Android emulator reaches it at
 *   10.0.2.2. The iOS simulator shares the Mac's network: the app uses `localhost` (what
 *   apps/mobile/src/config/env.ts defaults to on iOS) and Expo Go opens Metro at 127.0.0.1;
 * - `appUrl`: the project URL Expo Go opens; `apiBaseUrl` / `authEmulatorHost`: what Metro inlines
 *   into the bundle.
 */
export function maestroTarget(platform, { metroPort, apiPort, authEmulatorPort }) {
  if (platform === 'ios') {
    return {
      platform,
      label: 'iOS',
      appId: 'host.exp.Exponent',
      host: 'localhost',
      appUrl: `exp://127.0.0.1:${metroPort}`,
      apiBaseUrl: `http://localhost:${apiPort}`,
      authEmulatorHost: `localhost:${authEmulatorPort}`,
    };
  }
  const host = '10.0.2.2';
  return {
    platform: 'android',
    label: 'Android',
    appId: 'host.exp.exponent',
    host,
    appUrl: `exp://${host}:${metroPort}`,
    apiBaseUrl: `http://${host}:${apiPort}`,
    authEmulatorHost: `${host}:${authEmulatorPort}`,
  };
}

// --------------------------------------------------------------------------- iOS simulator

/** The simulator the harness creates for itself, so a developer's own simulators keep their data. */
export const IOS_SIMULATOR_NAME = 'OrenjiTrade Maestro';
export const IOS_SIMULATOR_NAME_ENV = 'ORENJI_IOS_SIMULATOR_NAME';
export const IOS_SIMULATOR_UDID_ENV = 'ORENJI_IOS_SIMULATOR_UDID';
export const IOS_SIMULATOR_TYPE_ENV = 'ORENJI_IOS_SIMULATOR_TYPE';

const versionParts = (version) => String(version ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);

function compareVersions(a, b) {
  const [left, right] = [versionParts(a), versionParts(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** The newest available iOS runtime of `xcrun simctl list runtimes -j` (its `runtimes` array), or null. */
export function newestIosRuntime(runtimes) {
  const ios = (runtimes ?? []).filter((runtime) => runtime.isAvailable !== false && (runtime.platform ?? 'iOS') === 'iOS');
  ios.sort((a, b) => compareVersions(b.version, a.version));
  return ios[0] ?? null;
}

/**
 * The iPhone model of the dedicated simulator among a runtime's `supportedDeviceTypes`: `wanted`
 * (a name such as "iPhone 17" or a device type identifier) when given, else a current phone: the
 * newest numbered standard model ("iPhone 17"), then the newest Pro, then any iPhone. The standard
 * model is the screen most collectors hold; Max, Plus, Air, mini, "e" and SE sizes stay opt-in.
 * Returns the device type, or null when the runtime supports none that fits.
 */
export function chooseIphoneType(deviceTypes, wanted) {
  const iphones = (deviceTypes ?? []).filter(
    (type) => (type.productFamily ?? 'iPhone') === 'iPhone' && /^iPhone\b/.test(type.name ?? ''),
  );
  if (wanted) {
    const key = wanted.trim().toLowerCase();
    return iphones.find((type) => type.name.toLowerCase() === key || type.identifier?.toLowerCase() === key) ?? null;
  }
  const generation = (pattern) =>
    iphones
      .map((type) => ({ type, match: pattern.exec(type.name) }))
      .filter((entry) => entry.match)
      .sort((a, b) => Number(b.match[1]) - Number(a.match[1]))[0]?.type;
  return generation(/^iPhone (\d+)$/) ?? generation(/^iPhone (\d+) Pro$/) ?? iphones[0] ?? null;
}

/**
 * The simulator to use among the `devices` map of `xcrun simctl list devices -j` (runtime
 * identifier -> devices): the one with `udid` when a UDID is given (any name), else the available
 * one called `name`, preferring `runtimeIdentifier` when several runtimes have one. Returns
 * `{ ...device, runtimeIdentifier }`, or null.
 */
export function findIosSimulator(devices, { udid, name, runtimeIdentifier }) {
  const all = Object.entries(devices ?? {}).flatMap(([runtime, list]) =>
    list.map((device) => ({ ...device, runtimeIdentifier: runtime })),
  );
  if (udid) {
    const wanted = udid.trim().toUpperCase();
    return all.find((device) => device.udid?.toUpperCase() === wanted) ?? null;
  }
  const named = all.filter((device) => device.name === name && device.isAvailable !== false);
  return named.find((device) => device.runtimeIdentifier === runtimeIdentifier) ?? named[0] ?? null;
}

/**
 * The settings files of a simulator (under its data directory) that hold "AutoFill Passwords":
 * the user's settings, the effective copy iOS computes from them and the copy apps read.
 */
export function passwordAutofillPlists(dataPath) {
  const p = path.posix;
  const user = p.join(dataPath, 'Library', 'UserConfigurationProfiles');
  const shared = p.join(
    dataPath,
    'Containers',
    'Shared',
    'SystemGroup',
    'systemgroup.com.apple.configurationprofiles',
    'Library',
    'ConfigurationProfiles',
  );
  return [
    p.join(shared, 'UserSettings.plist'),
    p.join(user, 'UserSettings.plist'),
    p.join(user, 'EffectiveUserSettings.plist'),
    p.join(user, 'PublicInfo', 'PublicEffectiveUserSettings.plist'),
  ];
}

/**
 * The preferences of the dedicated simulator, as `{ domain, key, type, value, restart }` for
 * `defaults write` inside the simulator (`type`: bool, string or array; `restart`: iOS only reads
 * it when it starts):
 * - language and region: US English whatever the Mac uses (a simulator inherits the Mac's
 *   languages and region), like the Android emulator the flows were written on. The app follows
 *   the device for its legal pages (English or French) and for dates and prices;
 * - keyboard: it types exactly what a flow gives it (iOS would otherwise "correct" a card name
 *   such as "emberfang") and never shows its "slide to type" introduction over the first keyboard;
 * - `exp://` links open in `expoGoAppId` without iOS asking "Open in Expo Go?" first (what Expo
 *   CLI writes for the simulator it opens a project on).
 */
export function iosSimulatorDefaults(expoGoAppId) {
  const settings = 'com.apple.Preferences';
  const keyboard = 'com.apple.keyboard.preferences';
  const off = (domain, key) => ({ domain, key, type: 'bool', value: false, restart: true });
  const on = (domain, key) => ({ domain, key, type: 'bool', value: true, restart: true });
  return [
    { domain: '-g', key: 'AppleLanguages', type: 'array', value: ['en-US'], restart: true },
    { domain: '-g', key: 'AppleLocale', type: 'string', value: 'en_US', restart: true },
    off(settings, 'KeyboardAutocorrection'),
    off(settings, 'KeyboardPrediction'),
    off(settings, 'KeyboardShowPredictionBar'),
    off(settings, 'KeyboardCheckSpelling'),
    off(settings, 'KeyboardPeriodShortcut'),
    on(keyboard, 'DidShowGestureKeyboardIntroduction'),
    on(keyboard, 'DidShowContinuousPathIntroduction'),
    {
      domain: 'com.apple.launchservices.schemeapproval',
      key: 'com.apple.CoreSimulator.CoreSimulatorBridge-->exp',
      type: 'string',
      value: expoGoAppId,
      restart: false,
    },
  ];
}

/** The `defaults write` arguments of one preference of iosSimulatorDefaults. */
export function defaultsWriteArgs({ domain, key, type, value }) {
  if (type === 'bool') {
    return ['write', domain, key, '-bool', value ? 'YES' : 'NO'];
  }
  if (type === 'array') {
    return ['write', domain, key, '-array', ...value];
  }
  return ['write', domain, key, '-string', String(value)];
}

/** True when the output of `defaults read <domain> <key>` already holds the preference's value. */
export function defaultsValueMatches({ type, value }, output) {
  const text = String(output ?? '').trim();
  if (type === 'bool') {
    return text === (value ? '1' : '0');
  }
  if (type === 'array') {
    // `defaults read` prints an array as ( "en-US", en ): compare the items, unquoted.
    const items = text
      .replace(/^\(|\)$/g, '')
      .split(',')
      .map((item) => item.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    return items.length === value.length && items.every((item, index) => item === value[index]);
  }
  return text === String(value);
}

/** What to print when the iOS simulator cannot be used on this machine. */
export function iosSimulatorUnavailableMessage({ hostPlatform, reason }) {
  if (hostPlatform !== 'darwin') {
    return 'The iOS simulator only exists on macOS: run the native suite on an Android emulator here (--platform android).';
  }
  return (
    `The iOS simulator is not usable: ${reason}. Install Xcode (26.4 or newer for Expo SDK 57) with an iOS ` +
    'simulator runtime, then check `xcrun simctl list runtimes` (docs/development/macos-setup.md section 9.2).'
  );
}

// ---------------------------------------------------------------------------- Terraform

/** How to install Terraform on this platform (for `npm run infra:validate`). */
export function terraformInstallHint(platform) {
  if (platform === 'win32') {
    return 'winget install Hashicorp.Terraform';
  }
  if (platform === 'darwin') {
    // homebrew-core dropped the `terraform` formula: only HashiCorp's own tap still has it.
    return 'brew tap hashicorp/tap && brew install hashicorp/tap/terraform';
  }
  return 'https://developer.hashicorp.com/terraform/install';
}

// ------------------------------------------------------------------------------- Python

/** The Python release apps/ml needs (apps/ml/pyproject.toml, CI: 3.12). */
export const ML_PYTHON_MIN = Object.freeze([3, 12]);

/** `[major, minor, patch]` out of `python --version` output ("Python 3.12.7"), or null. */
export function parsePythonVersion(output) {
  const match = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(String(output ?? ''));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
}

/** True when `version` ([major, minor, ...]) is at least `min`. */
export function pythonIsSupported(version, min = ML_PYTHON_MIN) {
  if (!version) {
    return false;
  }
  return version[0] > min[0] || (version[0] === min[0] && version[1] >= min[1]);
}

/** The interpreter of the apps/ml virtual environment (Scripts\python.exe on Windows, bin/python elsewhere). */
export function mlVenvPython(mlDir, platform) {
  const p = pathFor(platform);
  return platform === 'win32' ? p.join(mlDir, '.venv', 'Scripts', 'python.exe') : p.join(mlDir, '.venv', 'bin', 'python');
}

/**
 * Interpreter names to try on PATH when apps/ml has no virtual environment. macOS ships
 * /usr/bin/python3 3.9 with the Command Line Tools while Homebrew's 3.12 is `python3.12`, hence the
 * versioned names after the plain ones. 3.12 comes first among them: it is the Python of CI and of
 * the ML image, and the one the documents tell a developer to install.
 */
export function pythonCommands(platform) {
  return platform === 'win32' ? ['python', 'py'] : ['python3', 'python', 'python3.12', 'python3.13', 'python3.14'];
}

/**
 * Picks the interpreter for the ML tests among the ones that answered `--version`
 * (`[{ python, source, version }]`, in preference order): the first that is Python 3.12+.
 * `tooOld` lists the ones that were found but are older, so the caller can say so.
 */
export function chooseMlPython(found, min = ML_PYTHON_MIN) {
  return {
    chosen: found.find((candidate) => pythonIsSupported(candidate.version, min)) ?? null,
    tooOld: found.filter((candidate) => !pythonIsSupported(candidate.version, min)),
  };
}

/** The commands that install the apps/ml requirements into its existing virtual environment. */
export function mlVenvInstallCommands(platform) {
  const [cd, pip] = platform === 'win32' ? ['cd apps\\ml', '.venv\\Scripts\\pip'] : ['cd apps/ml', '.venv/bin/pip'];
  return `${cd} && ${pip} install -r requirements.txt -r requirements-dev.txt`;
}

/** The commands that create the apps/ml virtual environment on this platform with `python`. */
export function mlVenvCommands(platform, python) {
  const [cd, install] = mlVenvInstallCommands(platform).split(' && ');
  return `${cd} && ${python} -m venv .venv && ${install}`;
}

const formatVersion = (version) => (version ? version.join('.') : 'an unknown version');

/** What to print when no Python 3.12+ can run the ML tests (`tooOld` from chooseMlPython). */
export function mlPythonMissingMessage({ platform, tooOld, min = ML_PYTHON_MIN }) {
  const wanted = `Python ${min.join('.')}+`;
  const install =
    { win32: 'winget install Python.Python.3.12', darwin: 'brew install python@3.12' }[platform] ??
    'install python3.12 with your package manager';
  const python = platform === 'win32' ? 'python' : 'python3.12';
  const venv = tooOld.find((candidate) => candidate.source === 'apps/ml/.venv');
  if (venv) {
    return (
      `apps/ml/.venv uses Python ${formatVersion(venv.version)}, but apps/ml needs ${wanted}. ` +
      `Delete apps/ml/.venv and create it again with a newer Python (${install}): ${mlVenvCommands(platform, python)}`
    );
  }
  const seen =
    tooOld.length > 0
      ? `${wanted} not found: ${tooOld.map((candidate) => `${candidate.source} is Python ${formatVersion(candidate.version)}`).join(', ')}.`
      : `${wanted} not found (no apps/ml/.venv and no Python on PATH).`;
  return `${seen} Install it (${install}), then create the virtual environment: ${mlVenvCommands(platform, python)}`;
}
