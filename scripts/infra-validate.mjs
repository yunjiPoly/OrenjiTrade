#!/usr/bin/env node
// npm run infra:validate — static checks of the (deferred) cloud infrastructure code, exactly like
// CI: `terraform fmt -check -recursive` on infrastructure/ and, per root module,
// `terraform init -backend=false` + `terraform validate`. No backend, no credentials, no plan/apply:
// nothing is created anywhere. Provider plugins are cached in .local-dev/terraform-plugin-cache
// (override with TF_PLUGIN_CACHE_DIR).

import fs from 'node:fs';
import path from 'node:path';
import {
  LOCAL_DEV_DIR,
  ROOT,
  capture,
  formatDuration,
  log,
  paint,
  run,
  table,
} from './lib/util.mjs';

const ROOT_MODULES = [
  'infrastructure/terraform/environments/dev',
  'infrastructure/terraform/environments/staging',
  'infrastructure/terraform/environments/prod',
  'infrastructure/cloudflare/terraform',
];

const version = capture('terraform', ['version']);
if (version.status !== 0) {
  log.error(
    'Terraform is not installed (needed only for this check). Install Terraform 1.9+ ' +
      '(winget install Hashicorp.Terraform / brew install terraform) and retry.',
  );
  process.exit(1);
}
log.info(version.stdout.split(/\r?\n/)[0]);

const pluginCache = process.env.TF_PLUGIN_CACHE_DIR ?? path.join(LOCAL_DEV_DIR, 'terraform-plugin-cache');
fs.mkdirSync(pluginCache, { recursive: true });
const env = {
  ...process.env,
  TF_IN_AUTOMATION: '1',
  TF_INPUT: '0',
  TF_PLUGIN_CACHE_DIR: pluginCache,
};

const results = [];
const started = Date.now();

log.step('terraform fmt -check -recursive infrastructure');
let t = Date.now();
const fmt = await run(
  { command: 'terraform', args: ['fmt', '-check', '-recursive', '-diff', 'infrastructure'], shell: false },
  { cwd: ROOT, env },
);
results.push(['fmt (infrastructure/)', fmt === 0 ? 'ok' : 'FAILED', formatDuration(Date.now() - t)]);

for (const dir of ROOT_MODULES) {
  log.step(`${dir}: terraform init -backend=false && terraform validate`);
  t = Date.now();
  const chdir = `-chdir=${path.join(ROOT, dir)}`;
  const init = capture('terraform', [chdir, 'init', '-backend=false', '-input=false', '-no-color'], {
    cwd: ROOT,
    env,
    timeout: 15 * 60_000,
  });
  if (init.status !== 0) {
    console.log(init.stdout, init.stderr);
    results.push([dir, 'FAILED (init)', formatDuration(Date.now() - t)]);
    continue;
  }
  const validate = await run(
    { command: 'terraform', args: [chdir, 'validate', '-no-color'], shell: false },
    { cwd: ROOT, env },
  );
  results.push([dir, validate === 0 ? 'ok' : 'FAILED (validate)', formatDuration(Date.now() - t)]);
}

console.log(paint('1', '\ninfra:validate summary\n'));
console.log(table([['Check', 'Result', 'Duration'], ...results]));
const failed = results.filter(([, result]) => result !== 'ok');
if (failed.length > 0) {
  log.error(`${failed.length} check(s) failed (${formatDuration(Date.now() - started)}).`);
  process.exit(1);
}
log.ok(`Terraform formatting and validation passed (${formatDuration(Date.now() - started)}). Nothing was planned or applied.`);
