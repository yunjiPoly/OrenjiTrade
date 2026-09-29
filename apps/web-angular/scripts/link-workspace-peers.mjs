#!/usr/bin/env node
/**
 * Links the peer dependencies of the workspace packages this app consumes as TypeScript source
 * (npm `file:` dependencies such as `@orenji/api-client`) to THIS app's node_modules.
 *
 * Why: the generated client in `packages/api-client/src` imports `@angular/core`, `rxjs`, ...
 * Node-style resolution looks for them relative to the package's real path, where they do not
 * exist. Installing them there would create a second copy of Angular (broken DI), and Angular's
 * `preserveSymlinks` workaround makes `ng serve` crawl the whole node_modules tree on Windows.
 * A symlink (junction on Windows) to the app's copy keeps a single Angular instance because
 * TypeScript, esbuild and Vite all resolve links to their real path.
 *
 * Idempotent. Runs on `postinstall` and before start/build/test/lint (`npm run workspace:prepare`).
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appPackage = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));

const fileLinks = Object.entries({
  ...appPackage.dependencies,
  ...appPackage.devDependencies,
}).filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'));

let linked = 0;
let problems = 0;

for (const [name, spec] of fileLinks) {
  const packageDir = resolve(appRoot, spec.slice('file:'.length));
  const manifestPath = join(packageDir, 'package.json');
  if (!existsSync(manifestPath)) {
    console.warn(`[link-workspace-peers] ${name}: ${manifestPath} not found, skipping`);
    problems++;
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    const source = join(appRoot, 'node_modules', peer);
    if (!existsSync(source)) {
      console.warn(`[link-workspace-peers] ${name}: peer ${peer} is not installed in ${appRoot}`);
      problems++;
      continue;
    }
    if (ensureLink(source, join(packageDir, 'node_modules', peer), name)) {
      linked++;
    }
  }
}

console.log(
  `[link-workspace-peers] ${linked} link(s) created, ${problems} problem(s), ${fileLinks.length} workspace package(s) checked.`,
);
process.exitCode = problems > 0 ? 1 : 0;

/** Creates `dest -> source` unless an equivalent link already exists. Returns true when created. */
function ensureLink(source, dest, owner) {
  mkdirSync(dirname(dest), { recursive: true });
  let existing = null;
  try {
    existing = lstatSync(dest);
  } catch {
    existing = null;
  }

  if (existing) {
    if (!existing.isSymbolicLink()) {
      console.error(
        `[link-workspace-peers] ${owner}: ${dest} is a real directory. A second copy of this package ` +
          `would break the app; remove it (it must not be installed inside the workspace package).`,
      );
      problems++;
      return false;
    }
    try {
      if (realpathSync(dest) === realpathSync(source)) {
        return false; // already correct
      }
    } catch {
      // dangling link, replace it
    }
    removeLink(dest);
  }

  // 'junction' is honoured on Windows (no admin rights needed) and ignored elsewhere.
  symlinkSync(source, dest, 'junction');
  console.log(`[link-workspace-peers] ${owner}: ${dest} -> ${source}`);
  return true;
}

function removeLink(path) {
  try {
    rmdirSync(path); // directory junction / symlink on Windows
  } catch {
    unlinkSync(path); // symlink on POSIX
  }
}
