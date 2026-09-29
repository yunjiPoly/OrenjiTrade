# @orenji/api-client

Angular `HttpClient` services and models for the OrenjiTrade REST API, generated with
[OpenAPI Generator](https://openapi-generator.tech/) (`typescript-angular`) from
[`docs/api/openapi.json`](../../docs/api/openapi.json).

**Never edit `src/` by hand.** The contract is exported from the Spring Boot application and
this package is regenerated from it (ADR 0006: DTO changes propagate by regeneration).

## Regenerate

```bash
# 1. Export the contract from the API (apps/api)
cd apps/api && ./gradlew exportOpenApi        # writes docs/api/openapi.json

# 2. Regenerate this package
cd packages/api-client
npm install                                   # once: installs @openapitools/openapi-generator-cli (needs Java 11+)
npm run generate                              # -> src/

# or, from apps/web-angular:
npm run generate:api                          # regenerates api-client AND shared-types
```

`openapitools.json` pins the generator version (currently 7.25.0). The CLI downloads that
exact JAR on first use, so regeneration is reproducible across machines and CI.

Generator options (see `package.json` → `generate`):

| Option                          | Why                                                                 |
| ------------------------------- | ------------------------------------------------------------------- |
| `ngVersion=22.0.0`              | Emits code for Angular 22 (standalone `provideApi()`, `inject`-ready) |
| `providedInRoot=true`           | Services are `@Injectable({ providedIn: 'root' })`, no module needed |
| `withInterfaces=true`           | `*ServiceInterface` files for easy mocking in tests                 |
| `useSingleRequestParameter=true`| Operations with parameters take one typed object                    |
| `stringEnums=true`              | Enums are string unions, matching the JSON wire format              |
| `supportsES6=true`              | Modern output                                                       |

`src/.openapi-generator-ignore` stops the generator from emitting `git_push.sh` and a nested
`.gitignore`.

## How the web app consumes it

`apps/web-angular/package.json` declares `"@orenji/api-client": "file:../../packages/api-client"`.
npm links the package into `node_modules/@orenji/api-client`, and the app compiles the
TypeScript source directly (`tsconfig.json` → `paths` + `preserveSymlinks`, `angular.json` →
`preserveSymlinks: true`). Because the symlinked path is kept, the generated code's
`@angular/*` and `rxjs` imports resolve against the **app's** `node_modules`; this package has
no Angular dependency of its own and must never install one (a second copy of Angular would
break dependency injection).

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
| `package.json`              | name, `generate` script, generator devDependency     |
| `openapitools.json`         | pinned generator version                             |
| `src/api/*.service.ts`      | one service per OpenAPI tag                          |
| `src/model/*.ts`            | DTO interfaces                                       |
| `src/configuration.ts`      | `Configuration` (base path, credentials, encoders)   |
| `src/provide-api.ts`        | `provideApi()` helper for `ApplicationConfig`        |
| `src/index.ts`              | barrel export                                        |
