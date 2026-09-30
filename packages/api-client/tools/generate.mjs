#!/usr/bin/env node
/**
 * Runs openapi-generator-cli (typescript-angular) against docs/api/openapi.json and writes the
 * generated sources to ../src.
 *
 * Why a wrapper instead of calling the CLI straight from package.json: the CLI resolves its
 * `openapitools.json` (pinned generator version) against `$PWD` / `INIT_CWD` before `cwd`, so when
 * it is launched through `npm run generate -w packages/api-client` (or from Git Bash anywhere in
 * the repo) it reads, and creates, an `openapitools.json` wherever the shell happens to be. Passing
 * the absolute `--openapitools` path pins it to this folder, so no stray config files appear.
 *
 * The spec is validated by the generator (no `--skip-validate-spec`): `OpenApiConfig` sets
 * `info.license.url`, which is what the OpenAPI 3.1 validator used to reject.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, 'node_modules', '@openapitools', 'openapi-generator-cli', 'main.js');

const args = [
  cli,
  '--openapitools',
  join(here, 'openapitools.json'),
  'generate',
  '-i',
  resolve(here, '../../../docs/api/openapi.json'),
  '-g',
  'typescript-angular',
  '-o',
  resolve(here, '../src'),
  '--additional-properties=ngVersion=22.0.0,providedInRoot=true,withInterfaces=true,useSingleRequestParameter=true,stringEnums=true,supportsES6=true',
];

const result = spawnSync(process.execPath, args, { cwd: here, stdio: 'inherit' });
if (result.error) {
  console.error(`[api-client/tools] failed to start the generator: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
