#!/usr/bin/env node
/**
 * Makes the region map's drawings from the web app's boundary files (ADR 0017):
 *   apps/web-angular/public/boundaries/<region>.json → assets/boundaries/<region>.json
 *
 * The web files are GeoJSON in degrees (Natural Earth 5.1.1, public domain; provenance in
 * docs/development/regions-boundaries.md) and are neither moved nor edited. The mobile copies are
 * the same borders already projected (Web Mercator, like the web's Leaflet map) into whole drawing
 * units and written as SVG path data, so the app draws them with react-native-svg as they are and
 * its bundle holds no degrees. `scripts/lib/boundaryOutlines.js` does the work.
 *
 * Usage: `npm run sync:boundaries` (writes) or `npm run sync:boundaries -- --check` (exit 1 when
 * stale). `__tests__/features/regionOutlines.test.ts` fails as well when a copy drifts from its
 * web file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import outlines from './lib/boundaryOutlines.js';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const webBoundariesDir = resolve(projectRoot, '../web-angular/public/boundaries');
const mobileBoundariesDir = resolve(projectRoot, 'assets/boundaries');

const check = process.argv.includes('--check');
let stale = false;
for (const region of Object.keys(outlines.REGION_VIEW)) {
  const source = resolve(webBoundariesDir, `${region}.json`);
  const target = resolve(mobileBoundariesDir, `${region}.json`);
  if (!existsSync(source)) {
    console.error(`[sync-boundaries] ${source} not found.`);
    process.exit(1);
  }
  const { outline, stats } = outlines.buildRegionOutline(
    region,
    JSON.parse(readFileSync(source, 'utf8'))
  );
  const expected = outlines.renderRegionOutline(outline);
  const current = existsSync(target) ? readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
  const summary = `${stats.shapes} states and provinces, ${stats.rings} rings, ${stats.points} points, ${expected.length} bytes`;
  if (current === expected) {
    console.log(`[sync-boundaries] assets/boundaries/${region}.json up to date (${summary}).`);
  } else if (check) {
    console.error(
      `[sync-boundaries] assets/boundaries/${region}.json is stale. Run \`npm run sync:boundaries\`.`
    );
    stale = true;
  } else {
    mkdirSync(mobileBoundariesDir, { recursive: true });
    writeFileSync(target, expected);
    console.log(`[sync-boundaries] wrote ${target} (${summary}).`);
  }
}
if (stale) {
  process.exit(1);
}
