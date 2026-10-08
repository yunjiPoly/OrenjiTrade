// Turns Natural Earth admin-1 attribute rows into the seeded subdivision list and the
// ne_id → subdivision lookup that build.mjs joins onto the shapes (ADR 0017). No I/O here, so
// scripts/lib/regions.test.mjs can test the rules on small fixtures.
import {
  COUNTRIES,
  CODE_REMAP,
  DISSOLVE,
  FEATURE_COUNTRY,
  LISTED_NOT_DRAWN,
  NAMES,
  NE_ID_CODE,
} from './config.mjs';

export const SUBDIVISION_CODE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

/**
 * @param {Array<Record<string,string>>} features Natural Earth attribute rows (ne_id, iso_3166_2,
 *   iso_a2, name, name_en, region, region_cod, geonunit)
 * @returns {{ lookup: Array<{neId:string, code:string, country:string, region:string}>,
 *   subdivisions: Array<{code:string, country:string, region:string, name:string,
 *   wholeCountry:boolean, drawn:boolean}>, problems: string[] }}
 */
export function buildLookup(features) {
  const countries = new Map(COUNTRIES.map((country) => [country.code, country]));
  const problems = [];
  const lookup = [];
  const names = new Map();
  for (const feature of features) {
    const neCode = (feature.iso_3166_2 ?? '').trim();
    const countryCode = countryOf(feature, neCode);
    if (countryCode === null || !countries.has(countryCode)) continue;
    const country = countries.get(countryCode);
    const code = codeOf(feature, neCode, country);
    if (!code) {
      problems.push(`${feature.ne_id} ${neCode} (${feature.name}): no subdivision code`);
      continue;
    }
    if (!SUBDIVISION_CODE.test(code) || (code !== country.code && !code.startsWith(`${country.code}-`))) {
      problems.push(`${feature.ne_id} ${neCode} (${feature.name}): invalid code ${code}`);
      continue;
    }
    lookup.push({ neId: String(feature.ne_id), code, country: country.code, region: country.region });
    if (!names.has(code)) {
      names.set(code, nameOf(feature, code, country));
    }
  }
  const subdivisions = [];
  for (const [code, name] of names) {
    const country = countries.get(lookup.find((row) => row.code === code).country);
    subdivisions.push({
      code,
      country: country.code,
      region: country.region,
      name,
      wholeCountry: country.mode === 'whole',
      drawn: true,
    });
  }
  for (const extra of LISTED_NOT_DRAWN) {
    if (names.has(extra.code)) {
      problems.push(`${extra.code} is listed as not drawn but has a polygon`);
      continue;
    }
    const country = countries.get(extra.country);
    subdivisions.push({
      code: extra.code,
      country: country.code,
      region: country.region,
      name: extra.name,
      wholeCountry: false,
      drawn: false,
    });
  }
  for (const country of COUNTRIES) {
    const own = subdivisions.filter((subdivision) => subdivision.country === country.code);
    if (own.length === 0) {
      problems.push(`${country.code} (${country.name}) has no subdivision`);
    }
    const byName = new Map();
    for (const subdivision of own) {
      const key = subdivision.name.toLocaleLowerCase('en');
      if (byName.has(key)) {
        problems.push(`${byName.get(key)} and ${subdivision.code} share the name ${subdivision.name}`);
      }
      byName.set(key, subdivision.code);
    }
  }
  subdivisions.sort(
    (a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name, 'en'),
  );
  lookup.sort((a, b) => a.neId.localeCompare(b.neId));
  return { lookup, subdivisions, problems };
}

function countryOf(feature, neCode) {
  if (Object.hasOwn(FEATURE_COUNTRY, neCode)) {
    return FEATURE_COUNTRY[neCode];
  }
  const iso = (feature.iso_a2 ?? '').trim();
  if (/^[A-Z]{2}$/.test(iso)) return iso;
  const prefix = neCode.slice(0, 2);
  return /^[A-Z]{2}$/.test(prefix) && neCode[2] === '-' ? prefix : null;
}

function codeOf(feature, neCode, country) {
  if (country.mode === 'whole') return country.code;
  const byId = NE_ID_CODE[String(feature.ne_id)];
  if (byId) return byId;
  if (country.mode === 'dissolve') return DISSOLVE[country.code](feature) ?? null;
  return CODE_REMAP[neCode] ?? neCode;
}

function nameOf(feature, code, country) {
  if (country.mode === 'whole') return country.name;
  if (NAMES[code]) return NAMES[code];
  const name = (feature.name_en || feature.name || '').trim();
  return name || code;
}

/** CSV of the lookup, joined by mapshaper on ne_id. */
export function lookupCsv(lookup) {
  return ['ne_id,code,country,region', ...lookup.map((row) => [row.neId, row.code, row.country, row.region].join(','))].join('\n') + '\n';
}
