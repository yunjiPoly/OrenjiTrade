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
  tools/                code-generation tooling with its own package.json + lockfile
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
cd packages/api-client
npm run generate                              # -> src/

# or, from apps/web-angular:
npm run generate:api                          # regenerates api-client AND shared-types
```

`tools/openapitools.json` pins the generator version. The CLI downloads that exact JAR on first
use, so regeneration is reproducible across machines and CI. `--skip-validate-spec` is passed
because the generator's OpenAPI 3.1 validator is stricter than the specification (it rejects a
`license` without `identifier`); the contract itself is validated by the API build.

Generator options (see `tools/package.json`):

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

1. `apps/web-angular/package.json` declares `"@orenji/api-client": "file:../../packages/api-client"`
   and `tsconfig.json` maps `@orenji/api-client` to `../../packages/api-client/src/index.ts`, so
   the generated TypeScript is compiled as part of the app (strict mode, AOT).
2. The generated code imports `@angular/core`, `@angular/common/http`, `rxjs` and `tslib`. They
   are declared here as **optional peer dependencies** (never installed here) and
   `apps/web-angular/scripts/link-workspace-peers.mjs` (run on `postinstall` and before
   start/build/test/lint) links `packages/api-client/node_modules/<peer>` to the web app's
   copies. TypeScript, esbuild and Vite resolve those links to their real path, so the bundle
   contains exactly one Angular and one rxjs.

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
| `tools/package.json`        | generator devDependency + generator command          |
| `tools/openapitools.json`   | pinned generator version                             |
| `src/api/*.service.ts`      | one service per OpenAPI tag                          |
| `src/model/*.ts`            | DTO interfaces                                       |
| `src/configuration.ts`      | `Configuration` (base path, credentials, encoders)   |
| `src/provide-api.ts`        | `provideApi()` helper for `ApplicationConfig`        |
| `src/index.ts`              | barrel export                                        |
