# Platform regions and boundary assets

How the regions catalogue and the map's boundary files are made (ADR 0017). Nothing here runs at
build or run time of the apps: the outputs are committed, and the app never contacts a map or
boundary provider.

## Source and licence

| | |
| --- | --- |
| Dataset | Natural Earth, 1:10m Cultural Vectors, **Admin 1 – States, Provinces** |
| Version | **5.1.1** |
| File | `ne_10m_admin_1_states_provinces.zip`, from the official `naciscdn.org` distribution linked by <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/> |
| SHA-256 (zip) | `efc59726337323058f9446210adc96673179cd344e053666ee3d28cb58ba2b05` |
| Licence | **Public domain** (<https://www.naturalearthdata.com/about/terms-of-use/>: no permission needed, credit optional). The map shows "Made with Natural Earth" anyway. |
| Tool | **mapshaper 0.7.59** (MPL-2.0), pinned, run through `npx` at build time only; never a dependency of an app |

The download, the shapefile and every intermediate file stay outside the repository.

## What is committed

- `apps/web-angular/public/boundaries/<region>.json`: one GeoJSON per platform region. Features
  are either a subdivision `{code, country, kind: 'subdivision'}` (ISO 3166-2 code, or the alpha-2
  code of a whole-country pseudo-subdivision) or a country outline `{country, kind: 'country'}`.
  Coordinates have at most 2 decimals (0.01°, below a pixel at the map's zoom levels).

  | File | Bytes | Gzipped | Subdivisions drawn | Country outlines |
  | --- | --- | --- | --- | --- |
  | `americas-north.json` | 241,416 | 59,667 (≈ 58 KiB) | 348 | 39 |
  | `americas-south.json` | 144,927 | 32,480 (≈ 32 KiB) | 243 | 14 |
  | `europe.json` | 315,908 | 70,272 (≈ 69 KiB) | 653 | 50 |

  1,259 subdivisions are seeded (V107); 1,244 are drawn. `LISTED_NOT_DRAWN` (10 subdivisions
  created after the data, e.g. `PA-10`, `ME-25`) and `TOO_SMALL_TO_DRAW` (four Maltese local
  councils and Vatican City, which collapse at 0.01°) are seeded but not drawn: the map lists them
  under their country.
- `apps/mobile/assets/boundaries/<region>.json` (mobile stage M9, 2026-10-12): the drawings the
  phone bundles, **made from the web files above** by `npm run sync:boundaries -w apps/mobile`
  (`apps/mobile/scripts/sync-boundaries.mjs` and `scripts/lib/boundaryOutlines.js`; no download,
  no tool outside the repository). Same source, version and licence; the web files are not moved
  or edited. Each file is the same borders already projected (Web Mercator, the projection of the
  web's Leaflet map; one drawing unit is 0.01° of longitude, the precision of the source) and
  written as SVG path data: `width`, `height`, the first view `home`, the country borders as one
  path and one entry per state or province `{code, box, d}`. The app therefore holds no degrees.

  | File | Bytes | States and provinces | Rings | Points |
  | --- | --- | --- | --- | --- |
  | `americas-north.json` | 103,734 | 348 | 599 | 12,056 |
  | `americas-south.json` | 61,962 | 243 | 293 | 7,070 |
  | `europe.json` | 139,413 | 653 | 862 | 15,414 |

  After a rebuild of the web files, run `npm run sync:boundaries -w apps/mobile` and commit the
  three copies: `npm run sync:boundaries -w apps/mobile -- --check` and the app's jest suite
  (`__tests__/features/regionOutlines.test.ts`: every copy is what the script writes from its web
  file today, every state the web draws is drawn, the first view is the web's `REGION_VIEW`) fail
  until then.
- `V106__platform_regions.sql` (tables) and `V107__platform_regions_seed.sql` (3 regions, 104
  countries, 1,259 subdivisions). V107 was written by the build below and, like every applied
  migration, is never regenerated in place: a catalogue change is a new migration (or an admin
  edit of a country's region / active flag).
- `scripts/regions/config.mjs` (regions, countries and their region, clip boxes, ISO code remaps,
  dissolves where Natural Earth is finer than ISO 3166-2: French regions, Spanish autonomous
  communities, the four UK nations, ...), `scripts/regions/lookup.mjs` (Natural Earth feature →
  ISO code) and `scripts/regions/build.mjs`.

## Rebuilding (owner side, rare)

```bash
# 1. Download and unzip ne_10m_admin_1_states_provinces.zip (5.1.1) somewhere outside the repo;
#    check its SHA-256 against the table above.
# 2. Build the three region files (and, only for a NEW seed migration, --sql with a new file name):
node scripts/regions/build.mjs --ne <dir>/ne_10m_admin_1_states_provinces.shp
# 3. Check the result:
npm run test:scripts        # scripts/lib/regions.test.mjs
```

Per region the build: keeps the `ne_id` field, joins the ISO code, country and region of each
feature, clips to the region's box, dissolves by code, simplifies (Visvalingam weighted, 3 %,
keep-shapes), drops features that collapsed at the output precision, adds the dissolved country
outlines and writes GeoJSON with `precision=0.01`.

`scripts/lib/regions.test.mjs` checks that every drawn code is a seeded subdivision of the right
country and region, that every seeded subdivision is drawn unless listed in `LISTED_NOT_DRAWN` or
`TOO_SMALL_TO_DRAW`, that each file stays under 400 KiB and that no coordinate has more than 2
decimals. Review the visual result on `/map` for each region before committing new files.
