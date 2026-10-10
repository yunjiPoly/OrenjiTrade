// Unit tests of the per-platform host tool helpers (node --test; npm run test:scripts): the Android
// SDK location, the Maestro / emulator / Terraform hints and the Python choice for the ML tests.
// Every platform is exercised on any machine; nothing here runs adb, maestro, terraform or python.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ML_PYTHON_MIN,
  adbCandidates,
  androidEmulatorCommand,
  androidSdkDirs,
  chooseMlPython,
  maestroNotFoundMessage,
  mlPythonMissingMessage,
  mlVenvCommands,
  mlVenvInstallCommands,
  mlVenvPython,
  noAndroidDeviceMessage,
  parsePythonVersion,
  pythonCommands,
  pythonIsSupported,
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
