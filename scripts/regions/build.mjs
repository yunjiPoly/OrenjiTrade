#!/usr/bin/env node
// Builds the platform-region boundary assets of the web map and, optionally, the seed migration
// of the regions / countries / subdivisions tables, from the Natural Earth 10m admin-1 shapefile
// (ADR 0017, docs/development/regions-boundaries.md). Build-time only: the app never runs
// mapshaper and never fetches boundaries from a third party.
//
//   node scripts/regions/build.mjs --ne <dir>/ne_10m_admin_1_states_provinces.shp
//        [--sql apps/api/src/main/resources/db/migration/V107__platform_regions_seed.sql]
//
// --ne   the unzipped Natural Earth 5.1.1 shapefile (download it yourself from
//        https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/,
//        served by naciscdn.org); never commit it
// --sql  also write the seed migration; refuses to overwrite an existing file (an applied
//        Flyway migration must never change: write a new migration instead)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { COUNTRIES, REGION_BBOX, REGIONS, TOO_SMALL_TO_DRAW } from './config.mjs';
import { buildLookup, lookupCsv } from './lookup.mjs';

/** Pinned build-time tool (MPL-2.0); run through npx, never a runtime dependency. */
export const MAPSHAPER = 'mapshaper@0.7.59';
/** Visvalingam weighted simplification kept per region (keep-shapes keeps small islands). */
export const SIMPLIFY = '3%';
/** Coordinate precision of the GeoJSON output (0.01° ≈ 1 km, below a pixel at zoom ≤ 7). */
export const PRECISION = '0.01';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'apps', 'web-angular', 'public', 'boundaries');
const FIELDS = 'ne_id,iso_3166_2,iso_a2,name,name_en,region,region_cod,geonunit';

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ne || !fs.existsSync(args.ne)) {
    fail('--ne <path to ne_10m_admin_1_states_provinces.shp> is required');
  }
  if (args.sql && fs.existsSync(args.sql)) {
    fail(`${args.sql} exists: never rewrite a Flyway migration, write a new one`);
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'orenji-regions-'));
  try {
    const attributes = path.join(work, 'admin1.csv');
    mapshaper(['-i', args.ne, 'encoding=utf8', '-filter-fields', FIELDS, '-o', attributes, 'format=csv']);
    const { lookup, subdivisions, problems } = buildLookup(parseCsv(fs.readFileSync(attributes, 'utf8')));
    if (problems.length > 0) {
      fail(`unmapped features:\n  ${problems.join('\n  ')}`);
    }
    const lookupPath = path.join(work, 'lookup.csv');
    fs.writeFileSync(lookupPath, lookupCsv(lookup));
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const dropped = [];
    for (const region of REGIONS) {
      const out = path.join(OUT_DIR, `${region.code}.json`);
      mapshaper([
        '-i', args.ne, 'encoding=utf8',
        '-filter-fields', 'ne_id',
        '-join', lookupPath, 'keys=ne_id,ne_id', 'fields=code,country,region', 'string-fields=code,country,region',
        '-filter', `region === '${region.code}'`,
        '-clip', `bbox=${REGION_BBOX[region.code].join(',')}`,
        '-dissolve', 'code', 'copy-fields=country',
        '-simplify', SIMPLIFY, 'weighted', 'keep-shapes',
        '-clean',
        '-dissolve', 'country', '+', 'name=countries',
        '-each', "kind='country'", 'target=countries',
        '-each', "kind='subdivision'", 'target=1',
        '-merge-layers', 'target=*', 'force', 'name=boundaries',
        '-o', out, 'format=geojson', `precision=${PRECISION}`,
      ]);
      dropped.push(...dropEmptyFeatures(out));
      const bytes = fs.statSync(out).size;
      const gzipped = zlib.gzipSync(fs.readFileSync(out), { level: 9 }).length;
      console.log(`${region.code}: ${kib(bytes)} (${kib(gzipped)} gzipped) → ${path.relative(ROOT, out)}`);
    }
    const tooSmall = [...new Set(dropped)].sort();
    if (tooSmall.join(',') !== [...TOO_SMALL_TO_DRAW].sort().join(',')) {
      fail(`empty features ${tooSmall.join(' ')} differ from TOO_SMALL_TO_DRAW in config.mjs`);
    }
    const counts = REGIONS.map(
      (region) => `${region.code} ${subdivisions.filter((s) => s.region === region.code).length}`,
    );
    console.log(`${subdivisions.length} subdivisions (${counts.join(', ')}), ${lookup.length} Natural Earth features`);
    if (args.sql) {
      fs.writeFileSync(args.sql, seedSql(subdivisions));
      console.log(`wrote ${path.relative(ROOT, args.sql)}`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Removes the features whose geometry collapsed at the output precision (mapshaper writes them with
 * a null geometry) and returns their codes; keeps mapshaper's one-feature-per-line layout.
 */
export function dropEmptyFeatures(file) {
  const collection = JSON.parse(fs.readFileSync(file, 'utf8'));
  const empty = collection.features.filter((feature) => feature.geometry === null);
  const kept = collection.features.filter((feature) => feature.geometry !== null);
  const lines = kept.map((feature) => JSON.stringify(feature)).join(',\n');
  fs.writeFileSync(file, `{"type":"FeatureCollection", "features": [\n${lines}\n]}`);
  return empty.map((feature) => feature.properties.code ?? feature.properties.country);
}

/** The seed migration: regions, countries, subdivisions (ADR 0017). */
export function seedSql(subdivisions) {
  const lines = [
    '-- Platform regions, countries and first-level subdivisions (ADR 0017). GENERATED by',
    '-- scripts/regions/build.mjs from scripts/regions/config.mjs and Natural Earth 10m admin-1 5.1.1',
    '-- (public domain). Never edit or regenerate this file once applied: write a new migration.',
    '',
    'INSERT INTO platform_region (code, name, sort_order, is_default) VALUES',
    REGIONS.map((r) => `    (${q(r.code)}, ${q(r.name)}, ${r.sortOrder}, ${r.isDefault})`).join(',\n') + ';',
    '',
    'INSERT INTO country (code, name, region_code, sort_order) VALUES',
    COUNTRIES.map((c, index) => `    (${q(c.code)}, ${q(c.name)}, ${q(c.region)}, ${index + 1})`).join(',\n') + ';',
    '',
    'INSERT INTO subdivision (code, country_code, name, whole_country) VALUES',
    subdivisions
      .map((s) => `    (${q(s.code)}, ${q(s.country)}, ${q(s.name)}, ${s.wholeCountry})`)
      .join(',\n') + ';',
    '',
  ];
  return lines.join('\n');
}

function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function mapshaper(args) {
  const windows = process.platform === 'win32';
  // npx is a .cmd script on Windows, which needs a shell: quote every argument for cmd.exe.
  const argv = ['--yes', MAPSHAPER, ...args].map((arg) => (windows ? `"${arg}"` : arg));
  const result = spawnSync(windows ? 'npx.cmd' : 'npx', argv, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: windows,
  });
  if (result.status !== 0) {
    fail(`mapshaper failed:\n${result.stderr || result.stdout}`);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows.shift();
  return rows.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((k, i) => [k, r[i]])));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ne') args.ne = argv[++i];
    else if (argv[i] === '--sql') args.sql = argv[++i];
    else fail(`unknown argument ${argv[i]}`);
  }
  return args;
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function fail(message) {
  console.error(`regions: ${message}`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
