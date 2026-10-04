// Writes e2e/.runtime/config.json, the runtime configuration `ng serve --configuration e2e` serves
// instead of public/config.json: the browser talks to the E2E API (E2E_API_URL, default
// http://localhost:8180) and the shared Auth emulator. Used by Playwright's webServer command (CI,
// direct runs); `npm run test:e2e` writes the same file itself before it starts the dev server.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webRuntimeConfig } from '../../../../scripts/lib/web-e2e-guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '..', '.runtime', 'config.json');
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8180';
const emulatorHost = new URL(process.env.E2E_AUTH_EMULATOR_URL ?? 'http://localhost:9099').host;

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(
  target,
  `${JSON.stringify(webRuntimeConfig({ apiUrl, emulatorHost }), null, 2)}\n`,
);
console.log(
  `[e2e] ${path.relative(process.cwd(), target)} → API ${apiUrl}, Auth emulator ${emulatorHost}`,
);
