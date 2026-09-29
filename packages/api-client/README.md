# @orenji/api-client

Angular `HttpClient` services and models for the OrenjiTrade REST API, generated with
[OpenAPI Generator](https://openapi-generator.tech/) (`typescript-angular`) from
[`docs/api/openapi.json`](../../docs/api/openapi.json).

**Never edit `src/` by hand.** The contract is exported from the Spring Boot application and
this package is regenerated from it (ADR 0006: DTO changes propagate by regeneration).

## Layout

```
packages/api-client/
  package.json          name, exports (src/index.ts), optional peer deps, `generate` script
  src/                  GENERATED — services, models, configuration, provide-api
  tools/                code-generation tooling with its own package.json + lockfile (NOT a workspace)
    generate.mjs        runs the CLI with an explicit --openapitools path (no stray config copies)
    openapitools.json   pinned generator version (7.25.0)
    node_modules/       @openapitools/openapi-generator-cli and its dependencies
```

The tooling lives in `tools/` on purpose: the generator CLI depends on `rxjs` and `tslib`, and
those must never be installed next to the generated sources (Node-style resolution from
`src/` would pick them up and the web bundle would ship a second `rxjs`).

## Regenerate

```bash
# 1. Export the contract from the API (apps/api)
cd apps/api && ./gradlew exportOpenApi        # writes docs/api/openapi.json

# 2. Regenerate this package (installs tools/ on first use; needs Java 11+)
npm run generate -w packages/api-client       # from the repo root -> src/

# or, everything at once (also from the repo root):
npm run generate:api                          # regenerates api-client AND shared-types
```

`tools/openapitools.json` pins the generator version. The CLI downloads that exact JAR on first
use, so regeneration is reproducible across machines and CI. `--skip-validate-spec` is passed
because the generator's OpenAPI 3.1 validator is stricter than the specification (it rejects a
`license` without `identifier`); the contract itself is validated by the API build.

Generator options (see `tools/generate.mjs`):

| Option                           | Why                                                                   |
| -------------------------------- | --------------------------------------------------------------------- |
| `ngVersion=22.0.0`               | Emits code for Angular 22 (standalone `provideApi()`, `inject`-ready) |
| `providedInRoot=true`            | Services are `@Injectable({ providedIn: 'root' })`, no module needed  |
| `withInterfaces=true`            | `*ServiceInterface` files for easy mocking in tests                   |
| `useSingleRequestParameter=true` | Operations with parameters take one typed object                      |
| `stringEnums=true`               | Enums are string unions, matching the JSON wire format                |
| `supportsES6=true`               | Modern output                                                         |

`src/.openapi-generator-ignore` stops the generator from emitting `git_push.sh` and a nested
`.gitignore`.

## How the web app consumes it

1. `apps/web-angular/package.json` declares `"@orenji/api-client": "*"` (a workspace dependency
   resolved by the root `npm ci`) and `tsconfig.json` maps `@orenji/api-client` to
   `../../packages/api-client/src/index.ts`, so the generated TypeScript is compiled as part of
   the app (strict mode, AOT).
2. The generated code imports `@angular/core`, `@angular/common/http`, `rxjs` and `tslib`. They
   are declared here as **optional peer dependencies** and are hoisted to the repository's root
   `node_modules` by the workspace install (the web app depends on them), so the generated
   sources resolve the very same copies the app uses: exactly one Angular and one rxjs in the
   bundle, no link script, no `preserveSymlinks`.

Wiring lives in `apps/web-angular/src/app/core/api/provide-api-client.ts`: the base path is
kept empty so every generated call is a relative `/api/...` request that the app's
`apiBaseUrlInterceptor` prefixes with the runtime `apiBaseUrl` from `config.json`.

```ts
import { MetaService } from '@orenji/api-client';

export class ApiVersionComponent {
  private readonly meta = inject(MetaService);
  // ...
  this.meta.getMeta().subscribe(...)
}
```

## Files

| Path                        | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| `package.json`              | name, `generate` script (delegates to `tools/`)      |
| `tools/package.json`        | generator devDependency, `generate` -> `generate.mjs` |
| `tools/openapitools.json`   | pinned generator version                             |
| `src/api/*.service.ts`      | one service per OpenAPI tag                          |
| `src/model/*.ts`            | DTO interfaces                                       |
| `src/configuration.ts`      | `Configuration` (base path, credentials, encoders)   |
| `src/provide-api.ts`        | `provideApi()` helper for `ApplicationConfig`        |
| `src/index.ts`              | barrel export                                        |
