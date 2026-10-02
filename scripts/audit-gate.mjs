#!/usr/bin/env node
// npm audit gate for the root npm workspace (web, mobile, packages/*).
//
//   npm run audit:gate
//
// Fails (exit 1) when `npm audit` reports any HIGH or CRITICAL advisory that is not listed in
// security/npm-audit-allowlist.json, or when an allowlist entry has expired. Moderate and low
// advisories are reported but never fail the gate (same threshold as the previous
// `npm audit --audit-level=high`).
//
// An allowlist entry is only for advisories with NO patched release available. Each entry needs a
// reason and an expiry date; after the expiry the gate fails again so the exception is re-reviewed.
// See docs/security/README.md ("npm audit exceptions").

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const allowlistPath = join(root, 'security', 'npm-audit-allowlist.json');
const FAILING = new Set(['high', 'critical']);

function ghsaOf(advisory) {
  const match = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i.exec(advisory.url ?? '');
  return match ? match[0].toUpperCase() : `npm-${advisory.source}`;
}

const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const active = new Map();
const expired = [];
for (const entry of allowlist.advisories ?? []) {
  if (!entry.id || !entry.reason || !entry.expires) {
    console.error(`audit-gate: allowlist entry is missing id, reason or expires: ${JSON.stringify(entry)}`);
    process.exit(1);
  }
  if (entry.expires < today) expired.push(entry);
  else active.set(entry.id.toUpperCase(), entry);
}

// On Windows npm is a .cmd shim, so it has to go through the shell; pass one fixed command string.
const run =
  process.platform === 'win32'
    ? spawnSync('npm audit --json', { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('audit-gate: npm audit did not return JSON (network or registry problem?)');
  console.error(run.stderr || run.stdout);
  process.exit(1);
}
if (report.error) {
  console.error(`audit-gate: npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(1);
}

// Advisory objects live in `via`; string entries only point at other vulnerable packages.
const advisories = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via === 'object' && via !== null) {
      const id = ghsaOf(via);
      if (!advisories.has(id)) advisories.set(id, { id, pkg, severity: via.severity, title: via.title, range: via.range });
    }
  }
}

const blocking = [];
const allowed = [];
const informational = [];
for (const advisory of advisories.values()) {
  if (!FAILING.has(advisory.severity)) informational.push(advisory);
  else if (active.has(advisory.id)) allowed.push(advisory);
  else blocking.push(advisory);
}

const line = (a) => `  ${a.severity.toUpperCase().padEnd(8)} ${a.id}  ${a.pkg} ${a.range ?? ''}  ${a.title ?? ''}`;
if (informational.length) {
  console.log(`audit-gate: ${informational.length} moderate/low advisories (reported, not blocking):`);
  informational.forEach((a) => console.log(line(a)));
}
if (allowed.length) {
  console.log(`audit-gate: ${allowed.length} high/critical advisories allowed by security/npm-audit-allowlist.json:`);
  allowed.forEach((a) => console.log(`${line(a)}\n           reason: ${active.get(a.id).reason} (expires ${active.get(a.id).expires})`));
}
if (expired.length) {
  console.error('audit-gate: expired allowlist entries (re-review them, then update or remove):');
  expired.forEach((e) => console.error(`  ${e.id} expired ${e.expires}: ${e.reason}`));
}
if (blocking.length) {
  console.error(`audit-gate: ${blocking.length} high/critical advisories are not allowlisted:`);
  blocking.forEach((a) => console.error(line(a)));
}
if (blocking.length || expired.length) process.exit(1);
console.log('audit-gate: OK (no unreviewed high/critical advisories)');
