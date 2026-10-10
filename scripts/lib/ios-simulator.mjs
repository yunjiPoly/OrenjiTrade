// The iOS simulator of the native Maestro suite (`npm run test:mobile:maestro -- --platform ios`).
//
// The suite never drives a developer's own simulators: it has ONE dedicated device, created when
// it is missing (a current iPhone on the newest installed iOS runtime), booted with `simctl` alone
// (no Simulator / DeviceHub window is needed, and none is opened), and shut down afterwards. What
// makes the runs deterministic is set inside that device only, never in the Mac's own settings:
//
//   * the "Save Password?" sheet iOS shows after a sign-in is switched off (AutoFill Passwords of
//     that simulator), because it would cover the app after every sign-in;
//   * US English, whatever language and region the Mac uses (a simulator inherits them);
//   * the software keyboard types what it is given: no auto-correction, no full stops of its own,
//     no "slide to type" introduction over the first keyboard;
//   * `exp://` links open in Expo Go without iOS asking "Open in Expo Go?" first (what Expo CLI
//     does for the simulator it opens a project on).
//
// Environment: ORENJI_IOS_SIMULATOR_NAME (another name for the dedicated device),
// ORENJI_IOS_SIMULATOR_UDID (use this existing simulator instead; it is configured the same way,
// so name a simulator you keep for tests), ORENJI_IOS_SIMULATOR_TYPE (the iPhone model to create,
// for example "iPhone 17 Pro").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOBILE_DIR, capture, childEnv, formatDuration, log, sleep } from './util.mjs';
import {
  IOS_SIMULATOR_NAME,
  IOS_SIMULATOR_NAME_ENV,
  IOS_SIMULATOR_TYPE_ENV,
  IOS_SIMULATOR_UDID_ENV,
  chooseIphoneType,
  defaultsValueMatches,
  defaultsWriteArgs,
  findIosSimulator,
  iosSimulatorDefaults,
  newestIosRuntime,
  passwordAutofillPlists,
} from './host-tools.mjs';

export const EXPO_GO_IOS = 'host.exp.Exponent';
const BOOT_TIMEOUT_MS = 5 * 60_000;
const EXPO_GO_INSTALL_TIMEOUT_MS = 6 * 60_000;

function simctl(args, options = {}) {
  return capture('xcrun', ['simctl', ...args], { timeout: 120_000, ...options });
}

function simctlJson(args) {
  const result = simctl([...args, '-j']);
  if (result.status !== 0) {
    throw new Error(`xcrun simctl ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim().split(/\r?\n/).slice(-2).join(' ')}`);
  }
  return JSON.parse(result.stdout);
}

/**
 * Whether this machine can run an iOS simulator: `{ ready, reason, runtime }`. Never throws; a
 * machine without Xcode (or not a Mac) answers `ready: false` with the reason.
 */
export function iosSimulatorSupport() {
  if (process.platform !== 'darwin') {
    return { ready: false, reason: 'this is not a Mac', runtime: null };
  }
  const result = simctl(['list', 'runtimes', '-j'], { timeout: 60_000 });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout).trim().split(/\r?\n/).slice(-1)[0] ?? '';
    return { ready: false, reason: `\`xcrun simctl\` does not work (${detail || 'Xcode is not installed'})`, runtime: null };
  }
  let runtime = null;
  try {
    runtime = newestIosRuntime(JSON.parse(result.stdout).runtimes);
  } catch {
    // unreadable output: treated as no runtime
  }
  return runtime
    ? { ready: true, reason: null, runtime }
    : { ready: false, reason: 'no iOS simulator runtime is installed (`xcodebuild -downloadPlatform iOS`)', runtime: null };
}

function simulatorState(udid) {
  const { devices } = simctlJson(['list', 'devices']);
  return findIosSimulator(devices, { udid });
}

/**
 * The simulator of the suite: the device ORENJI_IOS_SIMULATOR_UDID names, else the dedicated
 * device (ORENJI_IOS_SIMULATOR_NAME, default "OrenjiTrade Maestro"), created on the newest iOS
 * runtime when it does not exist. Returns `{ udid, name, state, runtimeName, created }`.
 */
export function ensureIosSimulator(env = process.env) {
  const support = iosSimulatorSupport();
  if (!support.ready) {
    throw new Error(support.reason);
  }
  const { runtime } = support;
  const { devices } = simctlJson(['list', 'devices']);
  const wantedUdid = env[IOS_SIMULATOR_UDID_ENV]?.trim();
  if (wantedUdid) {
    const device = findIosSimulator(devices, { udid: wantedUdid });
    if (!device || device.isAvailable === false) {
      throw new Error(`${IOS_SIMULATOR_UDID_ENV}=${wantedUdid}: no such available simulator (\`xcrun simctl list devices available\`).`);
    }
    return { udid: device.udid, name: device.name, state: device.state, runtimeName: device.runtimeIdentifier, created: false };
  }
  const name = env[IOS_SIMULATOR_NAME_ENV]?.trim() || IOS_SIMULATOR_NAME;
  const existing = findIosSimulator(devices, { name, runtimeIdentifier: runtime.identifier });
  if (existing) {
    return { udid: existing.udid, name, state: existing.state, runtimeName: existing.runtimeIdentifier, created: false };
  }
  const wantedType = env[IOS_SIMULATOR_TYPE_ENV]?.trim();
  const type = chooseIphoneType(runtime.supportedDeviceTypes, wantedType);
  if (!type) {
    throw new Error(
      wantedType
        ? `${IOS_SIMULATOR_TYPE_ENV}=${wantedType}: ${runtime.name} has no such iPhone (\`xcrun simctl list devicetypes\`).`
        : `${runtime.name} supports no iPhone simulator.`,
    );
  }
  const created = simctl(['create', name, type.identifier, runtime.identifier]);
  const udid = created.stdout.trim().split(/\r?\n/).pop();
  if (created.status !== 0 || !udid) {
    throw new Error(`Could not create the simulator "${name}" (${type.name}, ${runtime.name}): ${created.stderr.trim()}`);
  }
  log.ok(`Created the dedicated simulator "${name}" (${type.name}, ${runtime.name}, ${udid}).`);
  return { udid, name, state: 'Shutdown', runtimeName: runtime.identifier, created: true };
}

/**
 * Boots the simulator without any window and waits until iOS has really finished booting
 * (`simctl bootstatus`: `simctl boot` returns long before SpringBoard is ready). Returns true when
 * this call booted it, false when it was booted already.
 */
export async function bootIosSimulator(udid) {
  const before = simulatorState(udid);
  const wasBooted = before?.state === 'Booted';
  if (!wasBooted) {
    const boot = simctl(['boot', udid]);
    if (boot.status !== 0 && !/current state: Booted/.test(boot.stderr)) {
      throw new Error(`Could not boot the simulator ${udid}: ${boot.stderr.trim()}`);
    }
  }
  const started = Date.now();
  // -b boots it when a concurrent shutdown just finished; the status line is the last one printed.
  const status = simctl(['bootstatus', udid, '-b'], { timeout: BOOT_TIMEOUT_MS });
  if (status.status !== 0) {
    throw new Error(
      `The simulator ${udid} did not finish booting within ${formatDuration(BOOT_TIMEOUT_MS)}: ` +
        (status.stderr || status.stdout).trim().split(/\r?\n/).slice(-1)[0],
    );
  }
  if (!wasBooted) {
    log.ok(`Simulator booted (${formatDuration(Date.now() - started)}, no window needed).`);
  }
  return !wasBooted;
}

/** Shuts the simulator down (a device that is already shut down is fine). */
export function shutdownIosSimulator(udid) {
  const result = simctl(['shutdown', udid]);
  if (result.status !== 0 && !/current state: Shutdown/.test(result.stderr)) {
    log.warn(`Could not shut the simulator ${udid} down: ${result.stderr.trim()}`);
    return false;
  }
  return true;
}

const AUTOFILL_KEY = 'restrictedBool.allowPasswordAutoFill.value';

/**
 * The settings files of the simulator in which AutoFill Passwords is still on (what Settings >
 * General > AutoFill & Passwords writes). They exist after the first boot, and only some of them
 * hold the key.
 */
function passwordAutofillFiles(dataPath) {
  return passwordAutofillPlists(dataPath).filter((file) => {
    if (!fs.existsSync(file)) {
      return false;
    }
    const current = capture('plutil', ['-extract', AUTOFILL_KEY, 'raw', '-o', '-', file]);
    return current.status === 0 && current.stdout.trim() !== 'false';
  });
}

function disablePasswordAutofill(files) {
  for (const file of files) {
    const write = capture('plutil', ['-replace', AUTOFILL_KEY, '-bool', 'NO', file]);
    if (write.status !== 0) {
      log.warn(`Could not switch AutoFill Passwords off in ${file}: ${write.stderr.trim()}`);
    }
  }
}

/** `defaults write` inside the simulator (its own preferences daemon); true when the value changed. */
function writeSimulatorDefault(udid, preference) {
  const current = simctl(['spawn', udid, 'defaults', 'read', preference.domain, preference.key]);
  if (current.status === 0 && defaultsValueMatches(preference, current.stdout)) {
    return false;
  }
  const write = simctl(['spawn', udid, 'defaults', ...defaultsWriteArgs(preference)]);
  if (write.status !== 0) {
    log.warn(`Could not set ${preference.domain} ${preference.key} in the simulator: ${write.stderr.trim()}`);
    return false;
  }
  return true;
}

async function waitForShutdown(udid) {
  const started = Date.now();
  while (simulatorState(udid)?.state !== 'Shutdown' && Date.now() - started < 60_000) {
    await sleep(500);
  }
}

/**
 * Boots the simulator and applies the settings of the header comment. Preferences are written
 * while iOS runs (its own `defaults`); iOS reads most of them, and the AutoFill files, only when
 * it starts, so a simulator whose settings changed is restarted once, and the AutoFill files are
 * edited while it is shut down (a running iOS would write its own copy back). A simulator that is
 * already configured is only booted. Returns true when this call booted it (false: it was booted
 * already, by a --keep-running run or by hand).
 */
export async function prepareIosSimulator(udid) {
  const booted = await bootIosSimulator(udid);
  const device = simulatorState(udid);
  if (!device?.dataPath) {
    throw new Error(`The simulator ${udid} has no data directory.`);
  }
  let restart = false;
  for (const preference of iosSimulatorDefaults(EXPO_GO_IOS)) {
    if (writeSimulatorDefault(udid, preference) && preference.restart) {
      restart = true;
    }
  }
  const autofill = passwordAutofillFiles(device.dataPath);
  if (restart || autofill.length > 0) {
    log.info('Simulator settings applied (US English, password AutoFill off, plain keyboard): restarting it once.');
    shutdownIosSimulator(udid);
    await waitForShutdown(udid);
    disablePasswordAutofill(autofill);
    await bootIosSimulator(udid);
  }
  return booted;
}

export function expoGoInstalledOnIos(udid) {
  return simctl(['get_app_container', udid, EXPO_GO_IOS]).status === 0;
}

/**
 * Makes sure the simulator has the Expo Go of the project's Expo SDK, through Expo CLI's own
 * installer (scripts/lib/expo-go-ios.mjs) and on this device only, whatever else is booted.
 * Returns true when Expo Go is there. Without network the installer cannot compare versions: an
 * Expo Go that is already installed is then used as it is, with a warning.
 */
export async function ensureExpoGoOnIos(udid) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'expo-go-ios.mjs');
  const started = Date.now();
  const result = capture(process.execPath, [script, MOBILE_DIR, udid], {
    cwd: MOBILE_DIR,
    env: childEnv({ CI: '1', EXPO_NO_TELEMETRY: '1' }),
    timeout: EXPO_GO_INSTALL_TIMEOUT_MS,
  });
  if (result.status === 0) {
    let outcome = {};
    try {
      outcome = JSON.parse(result.stdout.trim().split(/\r?\n/).pop());
    } catch {
      // the summary line is informative only
    }
    log.ok(
      outcome.installed
        ? `Expo Go ${outcome.version ?? ''} installed on the simulator by Expo CLI (${formatDuration(Date.now() - started)}).`
        : `Expo Go ${outcome.version ?? ''} is on the simulator.`,
    );
    return true;
  }
  const detail = (result.stderr || result.stdout).trim().split(/\r?\n/).slice(-3).join('\n');
  if (expoGoInstalledOnIos(udid)) {
    log.warn(`Expo CLI could not check the Expo Go version (offline?); using the Expo Go that is installed.\n${detail}`);
    return true;
  }
  log.error(`Expo Go could not be installed on the simulator.\n${detail}`);
  return false;
}
