#!/usr/bin/env node
// npm run api:dev — the API on http://localhost:8080 with Gradle bootRun and the `local` profile
// (gradlew.bat on Windows, ./gradlew elsewhere). Needs the infrastructure (npm run infra:up).
// Seed data is applied by SeedDataRunner at start-up. Extra arguments go to Gradle, e.g.
//   npm run api:dev -- --offline

import {
  API_DIR,
  PORTS,
  URLS,
  childEnv,
  log,
  portInUse,
  runGradle,
} from './lib/util.mjs';

const extra = process.argv.slice(2);

if (!(await portInUse(PORTS.postgres)) || !(await portInUse(PORTS.redis))) {
  log.warn(
    `PostgreSQL (:${PORTS.postgres}) or Redis (:${PORTS.redis}) is not reachable; start the infrastructure first: npm run infra:up`,
  );
}
if (await portInUse(PORTS.api)) {
  log.warn(`Port ${PORTS.api} is already in use; the API will fail to bind. Stop the other process first.`);
}

// Ctrl+C reaches Gradle directly (same console / process group); this process just waits for it
// to cancel the build and stop the application.
for (const signal of ['SIGINT', 'SIGBREAK']) {
  process.on(signal, () => log.info('Stopping the API...'));
}

log.info(`Starting the API (profile local). Ready when ${URLS.apiReadiness} answers 200; Swagger UI: ${URLS.swagger}`);
const code = await runGradle(['bootRun', ...extra], {
  cwd: API_DIR,
  env: childEnv({ SPRING_PROFILES_ACTIVE: 'local' }),
  // stdin is not needed; on Windows it also avoids cmd's "Terminate batch job (Y/N)?" prompt on Ctrl+C.
  stdio: ['ignore', 'inherit', 'inherit'],
});
process.exit(code);
