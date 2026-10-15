// npm run test:mobile:maestro — the native proof: every Maestro flow under apps/mobile/.maestro
// against the app running in Expo Go on a local Android emulator or on the iOS simulator (free,
// local; never EAS, never Maestro Cloud), backed by the same isolated stack as the mobile web E2E
// suite:
//
//   * the isolated API on :8090 (database orenjitrade_mobile_e2e): reused when a
//     `npm run test:mobile:e2e -- --keep-running|--stack-only` run left it, otherwise started (and
//     stopped afterwards) exactly like test:mobile:e2e does; the developer API on :8080 is never
//     used;
//   * the platform: `--platform android|ios`, else ORENJI_MAESTRO_PLATFORM, else Android when an
//     Android device is ready and otherwise the iOS simulator on a Mac with Xcode;
//   * Metro on :8082 with the app pointed at the host as the device sees it. A Metro this script
//     did not start is never reused (it could point the app at the developer API), a kept Metro of
//     the other platform neither (the API address is inlined into the bundle), and the bundle of
//     the platform is checked for the isolated API URL before any flow runs;
//   * Maestro CLI: MAESTRO_BIN, or `maestro` on PATH, or ~/.maestro/bin.
//
// Android: start an emulator first, for example
// `~/Library/Android/sdk/emulator/emulator -avd Pixel_6_API_35 -no-snapshot-save` on macOS or
// `%LOCALAPPDATA%/Android/Sdk/emulator/emulator -avd Pixel_6_API_34 -no-snapshot-save` on Windows;
// adb comes from ANDROID_HOME, ANDROID_SDK_ROOT, the SDK's default folder, then PATH. Metro runs
// `expo start --port 8082 --android --clear` with EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8090 and
// the Auth emulator at 10.0.2.2:9099; Expo CLI installs the free Expo Go app on the emulator when it
// is missing, and the harness waits for that install.
//
// iOS (a Mac with Xcode): nothing to start. The harness has its own simulator (ios-simulator.mjs:
// "OrenjiTrade Maestro", created when missing, booted without a window, shut down afterwards), so
// a developer's simulators keep their data and settings. Metro runs `expo start --port 8082
// --clear` with EXPO_PUBLIC_API_BASE_URL=http://localhost:8090 and the Auth emulator at
// localhost:9099 (the simulator shares the Mac's network); Expo Go is installed on that simulator
// by Expo CLI's installer, whatever other simulator is booted.
//
// Every account the flows create is `m-<run id>-...@mobile-e2e.test` and is deleted from the Auth
// emulator at the end (best effort, only that run's accounts).
// Flags: --platform android|ios, --keep-running (leave the API and Metro running, and the
// simulator booted), --stop (stop what --keep-running left), --skip-build (reuse the last API jar);
// other arguments are flow files/folders (default: the whole apps/mobile/.maestro workspace).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  IS_WINDOWS,
  MOBILE_DIR,
  PORTS,
  capture,
  childEnv,
  formatDuration,
  isAlive,
  listeningPids,
  log,
  parseFlags,
  portInUse,
  resolvePackageFile,
  run,
  waitForHttp,
} from './util.mjs';
import {
  adbCandidates,
  chooseMaestroPlatform,
  iosSimulatorUnavailableMessage,
  maestroNotFoundMessage,
  maestroTarget,
  noAndroidDeviceMessage,
  splitPlatformArgs,
} from './host-tools.mjs';
import {
  ensureExpoGoOnIos,
  ensureIosSimulator,
  iosSimulatorSupport,
  prepareIosSimulator,
  shutdownIosSimulator,
} from './ios-simulator.mjs';
import { deleteRunAccounts, newRunId } from './mobile-e2e-guard.mjs';
import {
  API_URL,
  AUTH_EMULATOR_URL,
  FIREBASE_PROJECT_ID,
  LOGS_DIR,
  WORK_DIR,
  ensureInfrastructure,
  ensureIsolatedApi,
  readState,
  stopProcess,
  stopRecorded,
  writeState,
} from './mobile-e2e.mjs';

const METRO_PORT = 8082;
const METRO_URL = `http://localhost:${METRO_PORT}`;
const EXPO_GO = 'host.exp.exponent';
const MAESTRO_DIR = path.join(MOBILE_DIR, '.maestro');
const MAESTRO_MEDIA = path.join(MAESTRO_DIR, 'media');
const MAESTRO_OUTPUT = path.join(WORK_DIR, 'maestro');
const SEED_EMAIL = 'collector1@orenjitrade.test';
const SEED_PASSWORD = 'LocalDev!2026';

/**
 * Dates the flows' fictional pictures (apps/mobile/.maestro/media) now, before Maestro runs. Their
 * `addMedia` (`xcrun simctl addmedia`) keeps a file's modification date as the photo's date, and
 * the photo pickers of the flows take the newest photo of the library: a checkout's date made the
 * copy of this run older than any photo added to the device since (a reviewer's fictional 9000 px
 * picture was taken instead, and refused by the API; one of the device owner's own photos would
 * have been uploaded to the local API). Only the dates change, never the content.
 *
 * @returns the files dated
 */
export function freshenFlowMedia(dir = MAESTRO_MEDIA, now = new Date()) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const dated = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.startsWith('.')) {
      const file = path.join(dir, entry.name);
      fs.utimesSync(file, now, now);
      dated.push(file);
    }
  }
  return dated;
}

/** App id, host and URLs of a platform (Android: the machine is 10.0.2.2; iOS: localhost). */
export function targetFor(platform) {
  return maestroTarget(platform, {
    metroPort: METRO_PORT,
    apiPort: PORTS.mobileE2eApi,
    authEmulatorPort: PORTS.authEmulator,
  });
}

function adbPath() {
  const candidates = adbCandidates({ platform: process.platform, env: process.env, home: os.homedir() });
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? 'adb';
}

function maestroPath() {
  if (process.env.MAESTRO_BIN) {
    return process.env.MAESTRO_BIN;
  }
  const onPath = capture(IS_WINDOWS ? 'where' : 'which', ['maestro']);
  if (onPath.status === 0 && onPath.stdout.trim()) {
    return onPath.stdout.trim().split(/\r?\n/)[0];
  }
  const home = path.join(os.homedir(), '.maestro', 'bin', IS_WINDOWS ? 'maestro.bat' : 'maestro');
  return fs.existsSync(home) ? home : null;
}

/** The first Android device in the `device` state (ANDROID_SERIAL wins). */
function androidDevice(adb) {
  if (process.env.ANDROID_SERIAL) {
    return process.env.ANDROID_SERIAL;
  }
  const devices = capture(adb, ['devices']);
  if (devices.status !== 0) {
    return null;
  }
  const ready = devices.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[1] === 'device')
    .map((parts) => parts[0]);
  return ready[0] ?? null;
}

/** Environment of Metro: the public values inlined into the bundle of `target`'s platform. */
export function metroEnv(base, target) {
  return {
    ...base,
    EXPO_PUBLIC_API_BASE_URL: target.apiBaseUrl,
    EXPO_PUBLIC_FIREBASE_API_KEY: 'demo-local-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'orenjitrade-local.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: target.authEmulatorHost,
    EXPO_NO_TELEMETRY: '1',
    // Non-interactive Expo CLI (no prompts, no file watching).
    CI: '1',
  };
}

/**
 * `expo start` arguments. Android: `--android`, so Expo CLI installs Expo Go on the emulator and
 * opens the project there. iOS: no `--ios`, because Expo CLI would open the project on the first
 * booted simulator it finds and bring the simulator window forward; the harness installs Expo Go
 * on its own simulator instead (ensureExpoGoOnIos) and the flows open the project.
 */
export function expoStartArgs(platform) {
  const args = ['start', '--port', String(METRO_PORT)];
  if (platform === 'android') {
    args.push('--android');
  }
  args.push('--clear');
  return args;
}

async function metroStatus() {
  try {
    const response = await fetch(`${METRO_URL}/status`, { signal: AbortSignal.timeout(3000) });
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
}

/**
 * Builds the platform's bundle once through Metro (warms it up for the first flow) and checks that
 * it targets the isolated API: a bundle without the API URL of the platform (http://10.0.2.2:8090
 * on Android, http://localhost:8090 on iOS) is refused.
 */
async function verifyBundle(target) {
  const manifestResponse = await fetch(`${METRO_URL}/`, {
    headers: { 'expo-platform': target.platform, accept: 'application/expo+json,application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!manifestResponse.ok) {
    throw new Error(`Metro manifest: HTTP ${manifestResponse.status}`);
  }
  const manifest = await manifestResponse.json();
  const launch = new URL(manifest.launchAsset?.url ?? manifest.bundleUrl);
  const bundleUrl = `${METRO_URL}${launch.pathname}${launch.search}`;
  log.info(`Building the ${target.label} bundle through Metro (first build takes a minute or two)`);
  const started = Date.now();
  const bundle = await fetch(bundleUrl, { signal: AbortSignal.timeout(15 * 60_000) });
  const text = await bundle.text();
  if (!bundle.ok) {
    throw new Error(`${target.label} bundle: HTTP ${bundle.status}\n${text.slice(0, 2000)}`);
  }
  if (!text.includes(target.apiBaseUrl)) {
    throw new Error(`The ${target.label} bundle does not target ${target.apiBaseUrl}; refusing to run the flows.`);
  }
  log.ok(
    `${target.label} bundle ready (${(text.length / 1e6).toFixed(1)} MB, ${formatDuration(Date.now() - started)}), API ${target.apiBaseUrl}.`,
  );
}

function startMetro(target) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, 'metro.log');
  const fd = fs.openSync(logFile, 'w');
  const cli = resolvePackageFile(MOBILE_DIR, '@expo/cli', path.join('build', 'bin', 'cli'));
  let child;
  try {
    child = spawn(process.execPath, [cli, ...expoStartArgs(target.platform)], {
      cwd: MOBILE_DIR,
      env: metroEnv(childEnv(), target),
      stdio: ['ignore', fd, fd],
      detached: true,
      windowsHide: true,
    });
  } finally {
    fs.closeSync(fd);
  }
  const handle = { name: 'metro', pid: child.pid, port: METRO_PORT, logFile, exitInfo: undefined };
  handle.exited = new Promise((resolve) => {
    child.on('exit', (code, signal) => {
      handle.exitInfo ??= { code, signal };
      resolve(handle.exitInfo);
    });
  });
  child.unref();
  return handle;
}

const EXPO_GO_INSTALL_TIMEOUT_MS = 6 * 60_000;

function expoGoInstalled(adb, device) {
  const installed = capture(adb, ['-s', device, 'shell', 'pm', 'list', 'packages', EXPO_GO]);
  return installed.status === 0 && installed.stdout.includes(EXPO_GO);
}

/**
 * Waits until Expo Go is on the device. `expo start --android` (the Metro this script started)
 * downloads and installs the free Expo Go app by itself when it is missing, which can take a few
 * minutes after the bundle is ready; checking once right away used to fail the run and stop Metro
 * in the middle of that install. A reused Metro does not install anything, so it is checked once.
 */
async function waitForExpoGo(adb, device, metro) {
  if (expoGoInstalled(adb, device)) {
    return true;
  }
  const hint =
    'Install it once with `cd apps/mobile && npx expo start --android --port 8082` (Expo CLI downloads the free Expo Go app), then rerun.';
  if (!metro) {
    log.error(`Expo Go is not installed on the device and the reused Metro does not install it. ${hint}`);
    return false;
  }
  log.info(`Expo Go is not installed yet; waiting for Expo CLI to install it (up to ${formatDuration(EXPO_GO_INSTALL_TIMEOUT_MS)}).`);
  const started = Date.now();
  while (Date.now() - started < EXPO_GO_INSTALL_TIMEOUT_MS) {
    if (metro.exitInfo) {
      log.error(`Metro exited (code ${metro.exitInfo.code}) before Expo Go was installed; see ${metro.logFile}. ${hint}`);
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
    if (expoGoInstalled(adb, device)) {
      log.ok(`Expo Go installed (${formatDuration(Date.now() - started)}).`);
      return true;
    }
  }
  log.error(`Expo Go was still not installed after ${formatDuration(EXPO_GO_INSTALL_TIMEOUT_MS)}; see ${metro.logFile}. ${hint}`);
  return false;
}

function maestroInvocation(maestro, args) {
  if (IS_WINDOWS && /\.(bat|cmd)$/i.test(maestro)) {
    const quote = (arg) => (/^[\w.,:=/\\@+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`);
    return { command: [quote(maestro), ...args.map(quote)].join(' '), args: [], shell: true };
  }
  return { command: maestro, args, shell: false };
}

/** Stops what earlier --keep-running runs left: Metro, the web server, the API and the simulator. */
async function stopKept() {
  const code = await stopRecorded(['metro', 'web', 'api']);
  const state = readState();
  if (state.simulator) {
    log.step(`Shutting down the kept iOS simulator (${state.simulator.udid})`);
    shutdownIosSimulator(state.simulator.udid);
    delete state.simulator;
    writeState(state);
  }
  return code;
}

/**
 * The device of the run: `{ id, describe }` plus, on iOS, what to undo afterwards. Android: the
 * first ready device, never started or stopped here. iOS: the dedicated simulator, created when
 * missing; it is booted later (prepareIosSimulator), once the API is up.
 */
function resolveDevice(platform, adb) {
  if (platform === 'ios') {
    const support = iosSimulatorSupport();
    if (!support.ready) {
      log.error(iosSimulatorUnavailableMessage({ hostPlatform: process.platform, reason: support.reason }));
      return null;
    }
    try {
      const simulator = ensureIosSimulator();
      return { id: simulator.udid, describe: `iOS simulator: ${simulator.name} (${simulator.udid})`, simulator };
    } catch (error) {
      log.error(iosSimulatorUnavailableMessage({ hostPlatform: process.platform, reason: error.message }));
      return null;
    }
  }
  const device = androidDevice(adb);
  if (!device) {
    log.error(noAndroidDeviceMessage({ platform: process.platform, adb }));
    return null;
  }
  return { id: device, describe: `Android device: ${device} (adb ${adb})` };
}

export async function testMobileMaestro(argv) {
  let split;
  try {
    split = splitPlatformArgs(argv);
  } catch (error) {
    log.error(error.message);
    return 1;
  }
  const { flags, rest } = parseFlags(split.rest, {
    keep: ['--keep-running'],
    skipBuild: ['--skip-build'],
    stop: ['--stop'],
  });
  if (flags.stop) {
    return stopKept();
  }
  const maestro = maestroPath();
  if (!maestro) {
    log.error(maestroNotFoundMessage(process.platform));
    return 1;
  }
  const adb = adbPath();
  let choice;
  try {
    choice = chooseMaestroPlatform({
      flag: split.platform,
      env: process.env,
      hostPlatform: process.platform,
      androidDeviceReady: () => androidDevice(adb) !== null,
      xcodeReady: () => iosSimulatorSupport().ready,
    });
  } catch (error) {
    log.error(error.message);
    return 1;
  }
  const target = targetFor(choice.platform);
  const resolved = resolveDevice(target.platform, adb);
  if (!resolved) {
    return 1;
  }
  const device = resolved.id;
  if (!choice.explicit && target.platform === 'ios') {
    log.info(`Platform: iOS (${choice.why}; choose with --platform android|ios).`);
  }
  log.info(`${resolved.describe}; Maestro: ${maestro}`);
  if ((await ensureInfrastructure()) !== 0) {
    return 1;
  }

  const started = [];
  // The Metro handle itself (not a copy): its `exitInfo` is filled in when Metro exits.
  let startedMetro = null;
  // iOS: true when this run booted the simulator; like the API and Metro, only what a run started
  // is stopped by it (a simulator kept by --keep-running stays until --stop).
  let simulatorBooted = false;
  const runId = process.env.E2E_RUN_ID || newRunId();
  let ready = false;
  try {
    const api = await ensureIsolatedApi({ reuse: true, skipBuild: flags.skipBuild });
    if (!api) {
      return 1;
    }
    if (api.handle) {
      started.push({ kind: 'api', ...api.handle });
    }

    if (target.platform === 'ios') {
      log.step('Booting the iOS simulator');
      simulatorBooted = await prepareIosSimulator(device);
      if (!simulatorBooted) {
        log.info('The simulator was booted already (a --keep-running run, or by hand); it is left booted afterwards.');
      }
    }

    const recordedMetro = readState().metro;
    const metroRecorded =
      recordedMetro && isAlive(recordedMetro.pid) && listeningPids(METRO_PORT).has(recordedMetro.pid);
    if (metroRecorded && (recordedMetro.platform ?? 'android') !== target.platform) {
      log.error(
        `The Metro server kept on :${METRO_PORT} serves the ${targetFor(recordedMetro.platform ?? 'android').label} app ` +
          `(its API address is inlined into the bundle). Stop it first: npm run test:mobile:maestro -- --stop`,
      );
      return 1;
    }
    if (metroRecorded) {
      log.info(`Reusing the Metro server this script started earlier (PID ${recordedMetro.pid}).`);
    } else {
      if (await portInUse(METRO_PORT)) {
        log.error(
          `Port ${METRO_PORT} is busy with a Metro server this script did not start; it may point the app at ` +
            'another API (the developer API writes into the developer database). Stop it and rerun.',
        );
        return 1;
      }
      log.step(`Starting Metro for Expo Go on :${METRO_PORT} (API ${target.apiBaseUrl}, log .local-dev/mobile-e2e/logs/metro.log)`);
      const metro = startMetro(target);
      startedMetro = metro;
      started.push({ kind: 'metro', platform: target.platform, ...metro });
      const waited = await waitForHttp(`${METRO_URL}/status`, {
        timeoutMs: 5 * 60_000,
        abortIf: () => (metro.exitInfo ? `Metro exited (code ${metro.exitInfo.code}); see ${metro.logFile}` : null),
      });
      log.ok(`Metro running (${formatDuration(waited)}): ${(await metroStatus()).trim()}`);
    }
    await verifyBundle(target);

    const expoGoReady =
      target.platform === 'ios' ? await ensureExpoGoOnIos(device) : await waitForExpoGo(adb, device, startedMetro);
    if (!expoGoReady) {
      return 1;
    }
    ready = true;

    if (flags.keep) {
      const state = readState();
      for (const handle of started) {
        state[handle.kind] = {
          pid: handle.pid,
          port: handle.port,
          instance: handle.instance,
          platform: handle.platform,
          startedAt: new Date().toISOString(),
        };
      }
      if (simulatorBooted) {
        state.simulator = { udid: device, startedAt: new Date().toISOString() };
      }
      writeState(state);
    }

    fs.mkdirSync(MAESTRO_OUTPUT, { recursive: true });
    freshenFlowMedia();
    // Flow paths are relative to where npm was invoked (INIT_CWD), Maestro runs in apps/mobile.
    const invokedFrom = process.env.INIT_CWD ?? process.cwd();
    const targets = rest.length > 0 ? rest.map((flow) => path.resolve(invokedFrom, flow)) : [MAESTRO_DIR];
    const env = {
      APP_ID: target.appId,
      APP_URL: target.appUrl,
      API_URL,
      AUTH_EMULATOR_URL,
      RUN_ID: runId,
      SEED_EMAIL,
      SEED_PASSWORD,
    };
    log.step(
      `Maestro (${target.label}): ${targets.map((flow) => path.relative(MOBILE_DIR, flow) || '.').join(', ')} (run ${runId})`,
    );
    return await run(
      maestroInvocation(maestro, [
        '--device',
        device,
        'test',
        ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
        '--format',
        'junit',
        '--output',
        path.join(MAESTRO_OUTPUT, 'report.xml'),
        '--debug-output',
        MAESTRO_OUTPUT,
        ...targets,
      ]),
      { cwd: MOBILE_DIR, env: childEnv({ MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' }) },
    );
  } catch (error) {
    log.error(error.message);
    return 1;
  } finally {
    try {
      const deleted = await deleteRunAccounts({ emulatorUrl: AUTH_EMULATOR_URL, projectId: FIREBASE_PROJECT_ID, runId });
      log.info(`Auth emulator: ${deleted} account(s) of run ${runId} deleted.`);
    } catch (error) {
      log.warn(`Could not delete the emulator accounts of run ${runId}: ${error.message}`);
    }
    if (!(flags.keep && ready)) {
      for (const handle of [...started].reverse()) {
        log.step(`Stopping the ${handle.kind} started for the Maestro run`);
        await stopProcess(handle.pid, handle.exited);
      }
      if (simulatorBooted) {
        log.step('Shutting down the iOS simulator');
        shutdownIosSimulator(device);
      }
    } else if (started.length > 0 || simulatorBooted) {
      log.ok(
        target.platform === 'ios'
          ? 'Left the API / Metro running and the simulator booted (--keep-running); stop them with `npm run test:mobile:maestro -- --stop`.'
          : 'Left the API / Metro running (--keep-running); stop them with `npm run test:mobile:maestro -- --stop`.',
      );
    }
  }
}
