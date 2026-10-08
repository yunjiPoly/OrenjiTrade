// Regenerates expo-router's typed routes (.expo/types/router.d.ts, git-ignored) from app/ without
// starting Metro, so `npm run typecheck` checks every `router.push(...)` against the routes that
// exist now (Expo CLI only regenerates them while a dev server runs). Same generator as
// `expo start` / `expo customize tsconfig.json`.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(projectRoot, 'package.json'));
const cli = path.dirname(require.resolve('@expo/cli/package.json'));
const typedRoutesModule = require.resolve('@expo/router-server/build/typed-routes', {
  paths: [cli],
});
const typesDirectory = path.join(projectRoot, '.expo', 'types');

// Read by the generator to find the routes (Metro compiles it away in app bundles).
process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, 'app');
fs.mkdirSync(typesDirectory, { recursive: true });

const typedRoutes = require(typedRoutesModule);
// Debounced inside expo-router: the declarations are written about a second later.
typedRoutes.regenerateDeclarations(typesDirectory, {});
