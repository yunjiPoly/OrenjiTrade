// npm run test:mobile:maestro — the native proof: every Maestro flow under apps/mobile/.maestro
// against the app running in Expo Go on a local Android emulator (free, local; never EAS, never
// Maestro Cloud), backed by the same isolated stack as the mobile web E2E suite:
//
//   * the isolated API on :8090 (database orenjitrade_mobile_e2e): reused when a
//     `npm run test:mobile:e2e -- --keep-running|--stack-only` run left it, otherwise started (and
//     stopped afterwards) exactly like test:mobile:e2e does; the developer API on :8080 is never
//     used;
//   * Metro on :8082 (`expo start --port 8082 --android --clear`) with the app pointed at the
//     host as the emulator sees it: EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8090 and the Auth
//     emulator at 10.0.2.2:9099. Expo CLI installs the free Expo Go app on the emulator when it is
//     missing. A Metro this script did not start is never reused (it could point the app at the
//     developer API); the Android bundle is checked for the isolated API URL before any flow runs;
//   * an Android device: start an emulator first, for example
//     `%LOCALAPPDATA%/Android/Sdk/emulator/emulator -avd Pixel_6_API_34 -no-snapshot-save`;
//   * Maestro CLI: MAESTRO_BIN, or `maestro` on PATH, or ~/.maestro/bin.
//
// Every account the flows create is `m-<run id>-...@mobile-e2e.test` and is deleted from the Auth
// emulator at the end (best effort, only that run's accounts).
// Flags: --keep-running (leave the API and Metro running), --stop (stop what --keep-running left),
// --skip-build (reuse the last API jar); other arguments are flow files/folders (default: the
// whole apps/mobile/.maestro workspace).

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
/** The development machine as seen from the Android emulator. */
const EMULATOR_HOST = '10.0.2.2';
const APP_API_URL = `http://${EMULATOR_HOST}:${PORTS.mobileE2eApi}`;
const EXPO_GO = 'host.exp.exponent';
const MAESTRO_DIR = path.join(MOBILE_DIR, '.maestro');
const MAESTRO_OUTPUT = path.join(WORK_DIR, 'maestro');
const SEED_EMAIL = 'collector1@orenjitrade.test';
const SEED_PASSWORD = 'LocalDev!2026';

function adbPath() {
  const exe = IS_WINDOWS ? 'adb.exe' : 'adb';
  for (const home of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]) {
    if (home && fs.existsSync(path.join(home, 'platform-tools', exe))) {
      return path.join(home, 'platform-tools', exe);
    }
  }
  const local = IS_WINDOWS
    ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk', 'platform-tools', exe)
    : path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', exe);
  return fs.existsSync(local) ? local : 'adb';
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

function metroEnv(base) {
  return {
    ...base,
    EXPO_PUBLIC_API_BASE_URL: APP_API_URL,
    EXPO_PUBLIC_FIREBASE_API_KEY: 'demo-local-key',
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'orenjitrade-local.firebaseapp.com',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: `${EMULATOR_HOST}:${PORTS.authEmulator}`,
    EXPO_NO_TELEMETRY: '1',
    // Non-interactive Expo CLI (no prompts, no file watching).
    CI: '1',
  };
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
 * Builds the Android bundle once through Metro (warms it up for the first flow) and checks that it
 * targets the isolated API: a bundle without http://10.0.2.2:8090 is refused.
 */
async function verifyAndroidBundle() {
  const manifestResponse = await fetch(`${METRO_URL}/`, {
    headers: { 'expo-platform': 'android', accept: 'application/expo+json,application/json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!manifestResponse.ok) {
    throw new Error(`Metro manifest: HTTP ${manifestResponse.status}`);
  }
  const manifest = await manifestResponse.json();
  const launch = new URL(manifest.launchAsset?.url ?? manifest.bundleUrl);
  const bundleUrl = `${METRO_URL}${launch.pathname}${launch.search}`;
  log.info('Building the Android bundle through Metro (first build takes a minute or two)');
  const started = Date.now();
  const bundle = await fetch(bundleUrl, { signal: AbortSignal.timeout(15 * 60_000) });
  const text = await bundle.text();
  if (!bundle.ok) {
    throw new Error(`Android bundle: HTTP ${bundle.status}\n${text.slice(0, 2000)}`);
  }
  if (!text.includes(APP_API_URL)) {
    throw new Error(`The Android bundle does not target ${APP_API_URL}; refusing to run the flows.`);
  }
  log.ok(`Android bundle ready (${(text.length / 1e6).toFixed(1)} MB, ${formatDuration(Date.now() - started)}), API ${APP_API_URL}.`);
}

function startMetro() {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const logFile = path.join(LOGS_DIR, 'metro.log');
  const fd = fs.openSync(logFile, 'w');
  const cli = resolvePackageFile(MOBILE_DIR, '@expo/cli', path.join('build', 'bin', 'cli'));
  let child;
  try {
    child = spawn(process.execPath, [cli, 'start', '--port', String(METRO_PORT), '--android', '--clear'], {
      cwd: MOBILE_DIR,
      env: metroEnv(childEnv()),
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

function maestroInvocation(maestro, args) {
  if (IS_WINDOWS && /\.(bat|cmd)$/i.test(maestro)) {
    const quote = (arg) => (/^[\w.,:=/\\@+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`);
    return { command: [quote(maestro), ...args.map(quote)].join(' '), args: [], shell: true };
  }
  return { command: maestro, args, shell: false };
}

export async function testMobileMaestro(argv) {
  const { flags, rest } = parseFlags(argv, {
    keep: ['--keep-running'],
    skipBuild: ['--skip-build'],
    stop: ['--stop'],
  });
  if (flags.stop) {
    return stopRecorded(['metro', 'web', 'api']);
  }
  const maestro = maestroPath();
  if (!maestro) {
    log.error('Maestro CLI not found: set MAESTRO_BIN (e.g. D:/maestro/bin/maestro.bat) or put maestro on PATH.');
    return 1;
  }
  const adb = adbPath();
  const device = androidDevice(adb);
  if (!device) {
    log.error(
      'No Android device is ready. Start an emulator first, e.g. ' +
        '`%LOCALAPPDATA%/Android/Sdk/emulator/emulator -avd Pixel_6_API_34 -no-snapshot-save -no-boot-anim`, ' +
        'then wait for `adb wait-for-device`.',
    );
    return 1;
  }
  log.info(`Android device: ${device} (adb ${adb}); Maestro: ${maestro}`);
  if ((await ensureInfrastructure()) !== 0) {
    return 1;
  }

  const started = [];
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

    const recordedMetro = readState().metro;
    const metroRecorded =
      recordedMetro && isAlive(recordedMetro.pid) && listeningPids(METRO_PORT).has(recordedMetro.pid);
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
      log.step(`Starting Metro for Expo Go on :${METRO_PORT} (API ${APP_API_URL}, log .local-dev/mobile-e2e/logs/metro.log)`);
      const metro = startMetro();
      started.push({ kind: 'metro', ...metro });
      const waited = await waitForHttp(`${METRO_URL}/status`, {
        timeoutMs: 5 * 60_000,
        abortIf: () => (metro.exitInfo ? `Metro exited (code ${metro.exitInfo.code}); see ${metro.logFile}` : null),
      });
      log.ok(`Metro running (${formatDuration(waited)}): ${(await metroStatus()).trim()}`);
    }
    await verifyAndroidBundle();

    const installed = capture(adb, ['-s', device, 'shell', 'pm', 'list', 'packages', EXPO_GO]);
    if (!installed.stdout.includes(EXPO_GO)) {
      log.error(
        'Expo Go is not installed on the device. Install it once with `cd apps/mobile && npx expo start --android --port 8082` ' +
          '(Expo CLI downloads the free Expo Go app), then rerun.',
      );
      return 1;
    }
    ready = true;

    if (flags.keep) {
      const state = readState();
      for (const handle of started) {
        state[handle.kind] = { pid: handle.pid, port: handle.port, instance: handle.instance, startedAt: new Date().toISOString() };
      }
      writeState(state);
    }

    fs.mkdirSync(MAESTRO_OUTPUT, { recursive: true });
    const targets = rest.length > 0 ? rest : [MAESTRO_DIR];
    const env = {
      APP_URL: `exp://${EMULATOR_HOST}:${METRO_PORT}`,
      API_URL,
      AUTH_EMULATOR_URL,
      RUN_ID: runId,
      SEED_EMAIL,
      SEED_PASSWORD,
    };
    log.step(`Maestro: ${targets.map((target) => path.relative(MOBILE_DIR, target) || '.').join(', ')} (run ${runId})`);
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
    } else if (started.length > 0) {
      log.ok('Left the API / Metro running (--keep-running); stop them with `npm run test:mobile:maestro -- --stop`.');
    }
  }
}
