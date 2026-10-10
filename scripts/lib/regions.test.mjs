// Consistency of the platform-region data (ADR 0017): the seeded regions, countries and
// subdivisions of migration V107, the bundled boundary assets of the web map and the rules of
// scripts/regions/. Pure file reads, no network, no database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { COUNTRIES, LISTED_NOT_DRAWN, REGIONS, TOO_SMALL_TO_DRAW } from '../regions/config.mjs';
import { SUBDIVISION_CODE, buildLookup, lookupCsv } from '../regions/lookup.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SEED = path.join(ROOT, 'apps/api/src/main/resources/db/migration/V107__platform_regions_seed.sql');
const BOUNDARIES = path.join(ROOT, 'apps/web-angular/public/boundaries');
/** Raw size budget of one boundary file (the web serves it gzip-compressed, lazily, per region). */
const MAX_BOUNDARY_BYTES = 400 * 1024;

/** Rows of one `INSERT INTO <table> (...) VALUES (...), (...);` block of the seed migration. */
function seedRows(sql, table) {
  const start = sql.indexOf(`INSERT INTO ${table} `);
  assert.ok(start >= 0, `no INSERT INTO ${table}`);
  const block = sql.slice(start, sql.indexOf(';', start));
  return [...block.matchAll(/^\s+\((.*)\),?$/gm)].map((match) =>
    [...match[1].matchAll(/'((?:[^']|'')*)'|(true|false|\d+)/g)].map((value) =>
      value[1] !== undefined ? value[1].replaceAll("''", "'") : value[2],
    ),
  );
}

const sql = fs.readFileSync(SEED, 'utf8');
const seededRegions = seedRows(sql, 'platform_region').map(([code, name, sortOrder, isDefault]) => ({
  code,
  name,
  sortOrder: Number(sortOrder),
  isDefault: isDefault === 'true',
}));
const seededCountries = new Map(
  seedRows(sql, 'country').map(([code, name, region]) => [code, { code, name, region }]),
);
const seededSubdivisions = new Map(
  seedRows(sql, 'subdivision').map(([code, country, name, whole]) => [
    code,
    { code, country, name, wholeCountry: whole === 'true' },
  ]),
);

describe('platform regions seed (V107)', () => {
  it('matches the configured regions, with americas-north as the only default', () => {
    assert.deepEqual(seededRegions, REGIONS);
    assert.deepEqual(
      seededRegions.filter((region) => region.isDefault).map((region) => region.code),
      ['americas-north'],
    );
  });

  it('seeds exactly the configured countries in their regions', () => {
    assert.equal(seededCountries.size, COUNTRIES.length);
    for (const country of COUNTRIES) {
      const seeded = seededCountries.get(country.code);
      assert.ok(seeded, `${country.code} is seeded`);
      assert.equal(seeded.region, country.region, country.code);
      assert.equal(seeded.name, country.name, country.code);
    }
  });

  it('uses ISO 3166-2 shaped codes prefixed by their country, with unique names per country', () => {
    const names = new Set();
    for (const subdivision of seededSubdivisions.values()) {
      assert.match(subdivision.code, SUBDIVISION_CODE);
      assert.ok(seededCountries.has(subdivision.country), `${subdivision.code} has a seeded country`);
      if (subdivision.wholeCountry) {
        assert.equal(subdivision.code, subdivision.country);
        assert.equal(subdivision.name, seededCountries.get(subdivision.country).name);
      } else {
        assert.ok(subdivision.code.startsWith(`${subdivision.country}-`), subdivision.code);
      }
      const key = `${subdivision.country}:${subdivision.name.toLocaleLowerCase('en')}`;
      assert.ok(!names.has(key), `duplicate name ${key}`);
      names.add(key);
    }
  });

  it('gives every country at least one subdivision and whole countries exactly one', () => {
    for (const country of COUNTRIES) {
      const own = [...seededSubdivisions.values()].filter((row) => row.country === country.code);
      assert.ok(own.length > 0, `${country.code} has subdivisions`);
      if (country.mode === 'whole') {
        assert.deepEqual(
          own.map((row) => row.code),
          [country.code],
        );
      } else {
        assert.ok(own.every((row) => !row.wholeCountry), country.code);
      }
    }
  });

  it('keeps the well-known subdivisions the seed accounts and tests use', () => {
    for (const code of ['CA-QC', 'CA-ON', 'US-CA', 'US-NY', 'AR-C', 'BR-SP', 'CL-RM', 'FR-IDF', 'ES-MD', 'DE-BE', 'GB-ENG', 'PR']) {
      assert.ok(seededSubdivisions.has(code), code);
    }
    assert.equal(seededSubdivisions.get('CA-QC').name, 'Quebec');
  });
});

describe('boundary assets (apps/web-angular/public/boundaries)', () => {
  for (const region of REGIONS) {
    const file = path.join(BOUNDARIES, `${region.code}.json`);

    it(`${region.code}: a small GeoJSON whose features are the seeded codes of the region`, () => {
      const bytes = fs.statSync(file).size;
      assert.ok(bytes <= MAX_BOUNDARY_BYTES, `${region.code}.json is ${bytes} bytes`);
      const text = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /\d\.\d{3,}/, 'coordinates are rounded to 2 decimals');
      const collection = JSON.parse(text);
      assert.equal(collection.type, 'FeatureCollection');
      const drawn = new Set();
      for (const feature of collection.features) {
        assert.match(feature.geometry.type, /^(Multi)?Polygon$/);
        const { code, country, kind } = feature.properties;
        assert.equal(seededCountries.get(country)?.region, region.code, `${code}: country ${country} in ${region.code}`);
        if (kind === 'country') {
          assert.deepEqual(Object.keys(feature.properties).sort(), ['country', 'kind']);
          continue;
        }
        assert.deepEqual(Object.keys(feature.properties).sort(), ['code', 'country', 'kind']);
        assert.equal(kind, 'subdivision');
        const subdivision = seededSubdivisions.get(code);
        assert.ok(subdivision, `${code} is a seeded subdivision`);
        assert.equal(subdivision.country, country, code);
        assert.ok(!drawn.has(code), `${code} is drawn once (dissolved)`);
        drawn.add(code);
      }
      const notDrawn = new Set([...LISTED_NOT_DRAWN.map((row) => row.code), ...TOO_SMALL_TO_DRAW]);
      for (const subdivision of seededSubdivisions.values()) {
        if (seededCountries.get(subdivision.country).region !== region.code) continue;
        assert.equal(
          drawn.has(subdivision.code),
          !notDrawn.has(subdivision.code),
          `${subdivision.code} drawn unless listed as not drawn`,
        );
      }
      const countries = new Set(
        collection.features
          .filter((feature) => feature.properties.kind === 'country')
          .map((feature) => feature.properties.country),
      );
      const outlined = COUNTRIES.filter(
        (row) => row.region === region.code && !TOO_SMALL_TO_DRAW.includes(row.code),
      );
      for (const country of outlined) {
        assert.ok(countries.has(country.code), `${country.code} has a country outline`);
      }
    });
  }
});

describe('buildLookup rules', () => {
  const row = (fields) => ({ ne_id: '1', iso_a2: '', name: '', name_en: '', region: '', region_cod: '', geonunit: '', ...fields });

  it('keeps ISO codes, maps a whole country to its alpha-2 code and flags unknown codes', () => {
    const { lookup, subdivisions, problems } = buildLookup([
      row({ ne_id: '10', iso_3166_2: 'CA-QC', iso_a2: 'CA', name: 'Québec', name_en: 'Quebec' }),
      row({ ne_id: '11', iso_3166_2: 'PR-X01', iso_a2: 'PR', name: 'Adjuntas' }),
      row({ ne_id: '12', iso_3166_2: 'CA-??', iso_a2: 'CA', name: 'Nowhere' }),
      row({ ne_id: '13', iso_3166_2: 'RU-MOW', iso_a2: 'RU', name: 'Moscow' }),
    ]);
    assert.deepEqual(
      lookup.map((entry) => [entry.neId, entry.code, entry.region]),
      [
        ['10', 'CA-QC', 'americas-north'],
        ['11', 'PR', 'americas-north'],
      ],
    );
    assert.equal(subdivisions.find((entry) => entry.code === 'PR').name, 'Puerto Rico');
    assert.ok(subdivisions.find((entry) => entry.code === 'PR').wholeCountry);
    assert.ok(problems.some((problem) => problem.includes('CA-??')), 'invalid code reported');
    assert.ok(!lookup.some((entry) => entry.code.startsWith('RU')), 'countries outside the regions are skipped');
    assert.match(lookupCsv(lookup), /^ne_id,code,country,region\n10,CA-QC,CA,americas-north\n/);
  });

  it('reports subdivisions of one country sharing a name', () => {
    const { problems } = buildLookup([
      row({ ne_id: '20', iso_3166_2: 'CA-QC', iso_a2: 'CA', name: 'Twin' }),
      row({ ne_id: '21', iso_3166_2: 'CA-ON', iso_a2: 'CA', name: 'Twin' }),
    ]);
    assert.ok(problems.some((problem) => problem.includes('share the name Twin')));
  });
});
