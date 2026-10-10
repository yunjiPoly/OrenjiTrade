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
