// Shared helpers for the local development scripts (scripts/*.mjs).
//
// Plain Node.js (>= 24), no dependencies. Works on Windows (cmd, PowerShell, Windows Terminal,
// Git Bash) and Unix shells. Every command is spawned without a shell where possible so that
// arguments are never re-parsed; the only exception is gradlew.bat on Windows, which must run
// through cmd.exe.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

export const IS_WINDOWS = process.platform === 'win32';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const API_DIR = path.join(ROOT, 'apps', 'api');
export const WEB_DIR = path.join(ROOT, 'apps', 'web-angular');
export const MOBILE_DIR = path.join(ROOT, 'apps', 'mobile');
export const ML_DIR = path.join(ROOT, 'apps', 'ml');
export const LOCAL_DEV_DIR = path.join(ROOT, '.local-dev');
export const LOG_DIR = path.join(LOCAL_DEV_DIR, 'logs');
/** Uploaded media of an API started on the host (bootRun or the jar, working dir apps/api). */
export const API_MEDIA_DIR = path.join(API_DIR, '.local-storage');

export const PORTS = Object.freeze({
  api: 8080,
  web: 4200,
  postgres: 5432,
  redis: 6379,
  authEmulator: 9099,
  emulatorUi: 4000,
  // Mobile web E2E (npm run test:mobile:e2e): an isolated API and the Expo web build, so a
  // developer's own API (8080) and web app (4200) keep running untouched.
  mobileE2eApi: 8090,
  mobileE2eWeb: 19006,
});

export const URLS = Object.freeze({
  web: `http://localhost:${PORTS.web}`,
  api: `http://localhost:${PORTS.api}`,
  apiReadiness: `http://localhost:${PORTS.api}/actuator/health/readiness`,
  swagger: `http://localhost:${PORTS.api}/swagger-ui.html`,
  authEmulator: `http://localhost:${PORTS.authEmulator}`,
  emulatorUi: `http://localhost:${PORTS.emulatorUi}`,
});

// ---------------------------------------------------------------------------------- output

const COLOR = !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);

export function paint(code, text) {
  return COLOR ? `\u001b[${code}m${text}\u001b[0m` : text;
}

const TAG = '[orenji]';

export const log = {
  step: (message) => console.log(`\n${paint('1;36', TAG)} ${paint('1', message)}`),
  info: (message) => console.log(`${paint('36', TAG)} ${message}`),
  ok: (message) => console.log(`${paint('32', TAG)} ${message}`),
  warn: (message) => console.warn(`${paint('33', TAG)} ${paint('33', message)}`),
  error: (message) => console.error(`${paint('31', TAG)} ${paint('31', message)}`),
};

/** Prints an error and exits with status 1. */
export function fail(message) {
  log.error(message);
  process.exit(1);
}

export function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 100) / 10;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - minutes * 60);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** Renders rows as an aligned plain-text table (first row = header). */
export function table(rows) {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => String(row[column] ?? '').length)),
  );
  const line = (row) =>
    row.map((cell, column) => String(cell ?? '').padEnd(widths[column])).join('   ').trimEnd();
  const separator = widths.map((width) => '-'.repeat(width)).join('   ');
  return [line(rows[0]), separator, ...rows.slice(1).map(line)].join('\n');
}

// ------------------------------------------------------------------------------ arguments

/** Splits argv into known boolean flags and the remaining (pass-through) arguments. */
export function parseFlags(argv, known) {
  const flags = Object.fromEntries(Object.keys(known).map((name) => [name, false]));
  const rest = [];
  for (const arg of argv) {
    const match = Object.entries(known).find(([, aliases]) => aliases.includes(arg));
    if (match) {
      flags[match[0]] = true;
    } else {
      rest.push(arg);
    }
  }
  return { flags, rest };
}

// ---------------------------------------------------------------------------- environment

/**
 * Reads the optional repository-root `.env` (copied from `.env.example`). Values already set in
 * the environment win; empty values are skipped so the application defaults apply.
 */
export function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  const values = {};
  if (!fs.existsSync(file)) {
    return values;
  }
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    if (value !== '') {
      values[match[1]] = value;
    }
  }
  return values;
}

/** Environment for child processes: `.env` defaults, then the current environment. */
export function childEnv(extra = {}) {
  return { ...loadDotEnv(), ...process.env, NG_CLI_ANALYTICS: 'false', ...extra };
}

// ---------------------------------------------------------------------------- invocations

function findNpmCli() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    process.env.npm_execpath,
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  return candidates.find(
    (candidate) => candidate && /npm-cli\.c?js$/.test(candidate) && fs.existsSync(candidate),
  );
}

/** `npm <args>` without a shell (node + npm-cli.js); falls back to the npm shim. */
export function npmInvocation(args) {
  const cli = findNpmCli();
  if (cli) {
    return { command: process.execPath, args: [cli, ...args], shell: false };
  }
  if (IS_WINDOWS) {
    return { command: ['npm', ...args.map(quoteForCmd)].join(' '), args: [], shell: true };
  }
  return { command: 'npm', args, shell: false };
}

/** The Gradle wrapper of apps/api: gradlew.bat through cmd.exe on Windows, sh ./gradlew elsewhere. */
export function gradleInvocation(args) {
  if (IS_WINDOWS) {
    // `.\` because cmd.exe does not search the current directory when
    // NoDefaultCurrentDirectoryInExePath is set (hardened shells, some IDE terminals).
    return { command: ['.\\gradlew.bat', ...args.map(quoteForCmd)].join(' '), args: [], shell: true };
  }
  return { command: 'sh', args: ['./gradlew', ...args], shell: false };
}

function quoteForCmd(arg) {
  return /^[\w.,:=/@+-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`;
}

/** Absolute path of a CLI script of an npm package installed in the workspace. */
export function resolvePackageFile(fromDir, packageName, relativeFile) {
  const require = createRequire(path.join(fromDir, 'package.json'));
  const packageJson = require.resolve(`${packageName}/package.json`);
  return path.join(path.dirname(packageJson), relativeFile);
}

export function ngInvocation(args) {
  const ng = resolvePackageFile(WEB_DIR, '@angular/cli', path.join('bin', 'ng.js'));
  return { command: process.execPath, args: [ng, ...args], shell: false };
}

export function playwrightInvocation(args) {
  const cli = resolvePackageFile(WEB_DIR, '@playwright/test', 'cli.js');
  return { command: process.execPath, args: [cli, ...args], shell: false };
}

// ------------------------------------------------------------------------------- running

/**
 * Children share our console only when we have one (interactive terminal); then Ctrl+C reaches
 * them directly on Windows. Without a console (background / piped runs) they are hidden so no
 * window pops up, and they are stopped explicitly.
 */
export const HAS_CONSOLE = !!(process.stdin.isTTY || process.stdout.isTTY || process.stderr.isTTY);

/** Runs a command with inherited stdio and resolves with its exit code. */
export function run(invocation, { cwd = ROOT, env = childEnv(), stdio = 'inherit' } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(invocation.command, invocation.args, {
        cwd,
        env,
        stdio,
        shell: invocation.shell,
        windowsHide: !HAS_CONSOLE,
      });
    } catch (error) {
      log.error(`Cannot start ${invocation.command}: ${error.message}`);
      resolve(127);
      return;
    }
    child.on('error', (error) => {
      log.error(`Cannot start ${invocation.command}: ${error.message}`);
      resolve(127);
    });
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

export const runNpm = (args, options) => run(npmInvocation(args), options);
export const runGradle = (args, options = {}) =>
  run(gradleInvocation(args), { cwd: API_DIR, ...options });
export const runDocker = (args, options) =>
  run({ command: 'docker', args, shell: false }, options);

/** Runs a command synchronously and returns { status, stdout, stderr } (never throws). */
export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
    ...options,
  });
  return {
    status: result.error ? 127 : result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

/** Splits a stream into lines and hands each complete line to `onLine`. */
function forEachLine(stream, onLine) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      onLine(line);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      onLine(buffer);
    }
  });
}

const STRIP_ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/**
 * A long-running child (API, web dev server) whose output is written to a log file under
 * .local-dev/logs and, optionally, echoed with a coloured prefix.
 */
export class ManagedProcess {
  constructor(name, invocation, { cwd, env, color = '36', echo = true, logFile }) {
    this.name = name;
    this.invocation = invocation;
    this.cwd = cwd;
    this.env = env;
    this.color = color;
    this.echo = echo;
    this.logFile = logFile ?? path.join(LOG_DIR, `${name}.log`);
    this.exitInfo = undefined;
    this.child = undefined;
  }

  start() {
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    const logStream = fs.createWriteStream(this.logFile, { flags: 'w' });
    this.child = spawn(this.invocation.command, this.invocation.args, {
      cwd: this.cwd,
      env: this.env,
      shell: this.invocation.shell,
      stdio: ['ignore', 'pipe', 'pipe'],
      // Unix: own process group, so the whole tree can be signalled at once.
      detached: !IS_WINDOWS,
      windowsHide: !HAS_CONSOLE,
    });
    this.pid = this.child.pid;
    this.exited = new Promise((resolve) => {
      const done = (code, signal) => {
        if (this.exitInfo === undefined) {
          this.exitInfo = { code, signal };
          resolve(this.exitInfo);
        }
      };
      this.child.on('exit', done);
      this.child.on('error', (error) => {
        logStream.write(`spawn error: ${error.message}\n`);
        done(127, null);
      });
    });
    const prefix = paint(this.color, `[${this.name}]`);
    const onLine = (line) => {
      const clean = line.replace(STRIP_ANSI, '');
      logStream.write(`${clean}\n`);
      if (this.echo) {
        process.stdout.write(`${prefix} ${COLOR ? line : clean}\n`);
      }
    };
    forEachLine(this.child.stdout, onLine);
    forEachLine(this.child.stderr, onLine);
    this.exited.then(() => logStream.end());
    return this;
  }

  get running() {
    return this.child !== undefined && this.exitInfo === undefined;
  }

  /** Sends SIGINT to the process group (Unix only; Windows children get the console Ctrl+C). */
  interrupt() {
    if (!this.running || IS_WINDOWS) {
      return;
    }
    try {
      process.kill(-this.pid, 'SIGINT');
    } catch {
      // already gone
    }
  }

  /** Unix: kills stragglers left in the child's process group after the leader exited. */
  sweepGroup() {
    if (IS_WINDOWS) {
      return;
    }
    try {
      process.kill(-this.pid, 'SIGKILL');
    } catch {
      // group already empty
    }
  }

  /** Kills the whole process tree immediately. */
  kill() {
    if (!this.running) {
      return;
    }
    killTree(this.pid);
  }

  /**
   * Stops the child: waits up to `graceMs` for it to exit (after SIGINT on Unix), then kills
   * its tree. `graceful: false` kills immediately.
   */
  async stop({ graceful = true, graceMs = 20_000 } = {}) {
    if (!this.running) {
      return;
    }
    // Windows without a shared console: nothing can deliver Ctrl+C to the child, so a grace
    // period would only delay the (inevitable) kill.
    if (graceful && !(IS_WINDOWS && !HAS_CONSOLE)) {
      this.interrupt();
      if (await settlesWithin(this.exited, graceMs)) {
        this.sweepGroup();
        return;
      }
      log.warn(`${this.name} did not exit within ${formatDuration(graceMs)}; killing it.`);
    }
    this.kill();
    await settlesWithin(this.exited, 10_000);
  }
}

/** Kills a process and all of its descendants. */
export function killTree(pid, signal = 'SIGKILL') {
  if (IS_WINDOWS) {
    capture('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
}

export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export function settlesWithin(promise, ms) {
  let timer;
  return Promise.race([
    promise.then(() => true),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------- ports

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** True when something accepts connections on localhost:port (IPv4 or IPv6). */
export async function portInUse(port) {
  return (await canConnect(port, '127.0.0.1')) || (await canConnect(port, '::1'));
}

/** PIDs listening on a TCP port (best effort: netstat on Windows, lsof or ss elsewhere). */
export function listeningPids(port) {
  const pids = new Set();
  if (IS_WINDOWS) {
    const { stdout } = capture('netstat', ['-ano', '-p', 'TCP']);
    const { stdout: stdout6 } = capture('netstat', ['-ano', '-p', 'TCPv6']);
    for (const line of `${stdout}\n${stdout6}`.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);
      // parts: proto, local, foreign, state, pid. The state name is localised on non-English
      // Windows, so a listening socket is also recognised by its wildcard foreign address.
      const listening = parts[3] === 'LISTENING' || /^(0\.0\.0\.0|\[::\]):0$/.test(parts[2] ?? '');
      if (parts.length >= 5 && listening && parts[1].endsWith(`:${port}`)) {
        pids.add(Number(parts[4]));
      }
    }
    return pids;
  }
  const lsof = capture('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
  if (lsof.status === 0 || lsof.stdout.trim()) {
    for (const pid of lsof.stdout.split(/\s+/).filter(Boolean)) {
      pids.add(Number(pid));
    }
    return pids;
  }
  const ss = capture('ss', ['-ltnpH', `sport = :${port}`]);
  for (const match of ss.stdout.matchAll(/pid=(\d+)/g)) {
    pids.add(Number(match[1]));
  }
  return pids;
}

/** Image name of a running process (best effort; 'unknown' when it cannot be read). */
export function processName(pid) {
  if (IS_WINDOWS) {
    const { stdout } = capture('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    const match = /^"([^"]+)"/.exec(stdout.trim());
    return match ? match[1] : 'unknown';
  }
  const { stdout } = capture('ps', ['-o', 'comm=', '-p', String(pid)]);
  return stdout.trim() || 'unknown';
}

export function describePortOwner(port) {
  const pids = [...listeningPids(port)].filter((pid) => pid > 0);
  if (pids.length === 0) {
    return 'unknown process';
  }
  return pids.map((pid) => `${processName(pid)} (PID ${pid})`).join(', ');
}

/** Fails with a helpful message when one of the ports is already taken. */
export async function assertPortsFree(entries) {
  const busy = [];
  for (const [label, port] of entries) {
    if (await portInUse(port)) {
      busy.push(`  - ${label} port ${port} is used by ${describePortOwner(port)}`);
    }
  }
  if (busy.length > 0) {
    const hint = IS_WINDOWS
      ? 'Find the owner with `netstat -ano | findstr :<port>` and stop it (`taskkill /PID <pid> /T /F`) if it is yours.'
      : 'Find the owner with `lsof -iTCP:<port> -sTCP:LISTEN` and stop it if it is yours.';
    fail(
      `Required ports are busy:\n${busy.join('\n')}\n` +
        `Stop the other process (an earlier \`npm run dev\`, a running API jar, \`ng serve\`, or the Docker "app" profile: \`docker compose --profile app stop api web\`).\n${hint}`,
    );
  }
}

// ----------------------------------------------------------------------------------- http

/** HTTP status of a GET (0 when unreachable). */
export async function httpStatus(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}

/**
 * Polls `url` until it answers 200. Rejects on timeout or as soon as `abortIf()` returns a
 * reason (e.g. the process that should serve it exited).
 */
export async function waitForHttp(url, { timeoutMs, intervalMs = 2000, abortIf = () => null }) {
  const started = Date.now();
  for (;;) {
    if ((await httpStatus(url)) === 200) {
      return Date.now() - started;
    }
    const reason = abortIf();
    if (reason) {
      throw new Error(reason);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`${url} did not answer 200 within ${formatDuration(timeoutMs)}`);
    }
    await sleep(intervalMs);
  }
}

// --------------------------------------------------------------------------------- docker

/** Exits with a clear message when the Docker CLI or engine is unavailable. */
export function ensureDocker() {
  const info = capture('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 30_000 });
  if (info.error?.code === 'ENOENT') {
    fail('Docker CLI not found. Install Docker Desktop (Windows/macOS) or Docker Engine (Linux).');
  }
  if (info.status !== 0) {
    fail(
      'Docker is not running (docker info failed). Start Docker Desktop and wait until it reports ' +
        '"Engine running", then retry.\n' +
        (info.stderr.trim().split(/\r?\n/).slice(-3).join('\n') || ''),
    );
  }
  const compose = capture('docker', ['compose', 'version', '--short']);
  if (compose.status !== 0) {
    fail('Docker Compose v2 (`docker compose`) is required. Update Docker Desktop / install the compose plugin.');
  }
}

/** `docker compose up -d --build --wait` for the infrastructure services (idempotent). */
export async function infraUp(extraArgs = []) {
  log.step('Starting infrastructure: PostGIS, Redis, Firebase Auth emulator (docker compose up -d --wait)');
  const started = Date.now();
  const code = await runDocker(
    ['compose', 'up', '-d', '--build', '--wait', '--wait-timeout', '300', ...extraArgs],
    { cwd: ROOT },
  );
  if (code !== 0) {
    log.error(
      'docker compose up failed. Check `docker compose ps` and `docker compose logs <service>`; ' +
        'a busy port 5432/6379/9099/4000 is the usual cause (see docs/development/local-setup.md#troubleshooting).',
    );
    return code;
  }
  log.ok(`Infrastructure healthy (${formatDuration(Date.now() - started)}).`);
  return 0;
}

// ----------------------------------------------------------------------------------- java

function javaMajor(javaBin) {
  const result = capture(javaBin, ['-version'], { timeout: 20_000 });
  if (result.status !== 0) {
    return 0;
  }
  const match = /version "(\d+)(?:\.(\d+))?/.exec(`${result.stderr}\n${result.stdout}`);
  if (!match) {
    return 0;
  }
  const major = Number(match[1]);
  return major === 1 ? Number(match[2]) : major;
}

/** The Java release the API is built for and runs on in CI and in the production image. */
export const API_JAVA_MAJOR = 21;

function subdirectories(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * The `java` binaries of the JDKs Gradle provisioned under `jdksDir` (~/.gradle/jdks). Gradle
 * unpacks each archive inside its own directory, so the JDK home is that directory or one level
 * below it, and on macOS the home is the bundle's Contents/Home:
 * `<vendor-21-arch-os>/jdk-21.0.x+y/Contents/Home/bin/java`.
 */
export function gradleJdkJavaBins(jdksDir, exe = IS_WINDOWS ? 'java.exe' : 'java') {
  const bins = [];
  for (const install of subdirectories(jdksDir)) {
    for (const root of [install, ...subdirectories(install)]) {
      for (const home of [root, path.join(root, 'Contents', 'Home')]) {
        const bin = path.join(home, 'bin', exe);
        if (fs.existsSync(bin)) {
          bins.push(bin);
        }
      }
    }
  }
  return bins;
}

/** macOS: the JDK home `/usr/libexec/java_home -v 21` names (it may be a newer JDK), else null. */
function macJavaHome() {
  const result = capture('/usr/libexec/java_home', ['-v', String(API_JAVA_MAJOR)], { timeout: 20_000 });
  const home = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  return home || null;
}

/**
 * Where the Java runtime of the API jar is looked for, in priority order: the two override
 * variables (ORENJI_JAVA_HOME, JAVA_HOME), `java` on PATH, on macOS the installed JDK
 * `/usr/libexec/java_home` names, then the JDKs Gradle provisioned under ~/.gradle/jdks.
 */
export function javaCandidates(
  env = process.env,
  { platform = process.platform, home = os.homedir(), javaHomeOfMac = macJavaHome } = {},
) {
  const exe = platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [];
  for (const name of ['ORENJI_JAVA_HOME', 'JAVA_HOME']) {
    if (env[name]) {
      candidates.push({ javaBin: path.join(env[name], 'bin', exe), source: name, override: true });
    }
  }
  candidates.push({ javaBin: 'java', source: '`java` on PATH', override: false });
  if (platform === 'darwin') {
    const macHome = javaHomeOfMac();
    if (macHome) {
      candidates.push({ javaBin: path.join(macHome, 'bin', exe), source: '/usr/libexec/java_home', override: false });
    }
  }
  const jdks = path.join(env.GRADLE_USER_HOME || path.join(home, '.gradle'), 'jdks');
  for (const javaBin of gradleJdkJavaBins(jdks, exe)) {
    candidates.push({ javaBin, source: 'the JDKs Gradle provisioned (~/.gradle/jdks)', override: false });
  }
  return candidates;
}

/**
 * Picks the Java runtime of the API jar among `candidates` (see javaCandidates). An override
 * variable that points at a usable Java (>= 21) wins, as before. Otherwise an exact Java 21 is
 * preferred wherever it is found, so the jar runs on what CI and production run; a newer Java is
 * only the last resort. `probe(javaBin)` returns the major version (0 when it cannot run) and is
 * called lazily, once per binary. Returns `{ javaBin, source, override, major, exact, ignored }`
 * (`ignored`: the override candidates that were set but unusable), or null when nothing fits.
 */
export function selectJava(candidates, probe, wanted = API_JAVA_MAJOR) {
  const majors = new Map();
  const majorOf = (candidate) => {
    if (!majors.has(candidate.javaBin)) {
      majors.set(candidate.javaBin, probe(candidate.javaBin));
    }
    return majors.get(candidate.javaBin);
  };
  const chosen =
    candidates.find((candidate) => candidate.override && majorOf(candidate) >= wanted) ??
    candidates.find((candidate) => majorOf(candidate) === wanted) ??
    candidates.find((candidate) => majorOf(candidate) > wanted);
  if (!chosen) {
    return null;
  }
  const ignored = candidates
    .filter((candidate) => candidate.override && majorOf(candidate) < wanted)
    .map((candidate) => ({ ...candidate, major: majorOf(candidate) }));
  const major = majorOf(chosen);
  return { ...chosen, major, exact: major === wanted, ignored };
}

/** The log lines a Java choice deserves: ignored override variables, and a runtime newer than 21. */
export function javaChoiceWarnings(choice, wanted = API_JAVA_MAJOR) {
  const warnings = choice.ignored.map(
    (candidate) =>
      `${candidate.source} is set, but ${candidate.javaBin} is ` +
      `${candidate.major > 0 ? `Java ${candidate.major}` : 'not a working Java'}; ignoring it (the API jar needs Java ${wanted}+).`,
  );
  if (!choice.exact) {
    let remedy = `No Java ${wanted} was found: install a JDK ${wanted} or set ORENJI_JAVA_HOME to one to test on the same Java.`;
    if (choice.source === 'ORENJI_JAVA_HOME') {
      remedy = `Point ORENJI_JAVA_HOME at a JDK ${wanted} to test on the same Java.`;
    } else if (choice.override) {
      remedy = `Set ORENJI_JAVA_HOME to a JDK ${wanted} to test on the same Java (it wins over ${choice.source}).`;
    }
    warnings.push(
      `The API jar will run on Java ${choice.major} (${choice.source}: ${choice.javaBin}), but CI and production run Java ${wanted}. ${remedy}`,
    );
  }
  return warnings;
}

function probeJava(javaBin) {
  return javaBin !== 'java' && !fs.existsSync(javaBin) ? 0 : javaMajor(javaBin);
}

/**
 * The Java runtime for the API jar (E2E harnesses, test-data purge): see selectJava for the rules
 * (override variables first, then an exact Java 21, a newer Java as the last resort with a
 * warning). Returns the path of the `java` binary, or null when no Java 21+ is found.
 */
export function findJava21() {
  const choice = selectJava(javaCandidates(), probeJava);
  if (!choice) {
    return null;
  }
  for (const warning of javaChoiceWarnings(choice)) {
    log.warn(warning);
  }
  return choice.javaBin;
}

// ------------------------------------------------------------------------------- prompting

/** Asks a yes/no question on the terminal; resolves false when stdin is not interactive. */
export async function confirm(question) {
  if (!process.stdin.isTTY) {
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise((resolve) => rl.question(`${question} [y/N] `, resolve));
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
