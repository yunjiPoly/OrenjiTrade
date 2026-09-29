# @orenji/shared-types

TypeScript types for the OrenjiTrade REST API, generated from
[`docs/api/openapi.json`](../../docs/api/openapi.json) with
[openapi-typescript](https://openapi-ts.dev/), plus `createApiClient()`, a typed
[openapi-fetch](https://openapi-ts.dev/openapi-fetch/) factory.

This package is consumed by the Expo mobile app (`apps/mobile`) and any other non-Angular
client. The Angular web app uses the generated `HttpClient` services in
[`packages/api-client`](../api-client) instead. Both come from the same contract, so DTO changes
propagate by regeneration, never by hand-editing (see ADR 0006).

## Regenerate

```bash
cd packages/shared-types
npm install
npm run generate      # docs/api/openapi.json -> src/schema.d.ts
npm run typecheck     # tsc --noEmit
```

The contract itself is exported from the Spring Boot application
(`cd apps/api && ./gradlew exportOpenApi`), never edited by hand. From `apps/web-angular`,
`npm run generate:api` regenerates this package and `packages/api-client` together.

## Usage

```ts
import { createApiClient, toApiError } from '@orenji/shared-types';

const api = createApiClient(process.env.EXPO_PUBLIC_API_BASE_URL!, () =>
  auth.currentUser?.getIdToken(),
);

const { data, error, response } = await api.GET('/api/v1/meta');
if (error) {
  throw toApiError(response.status, error);
}
console.log(data.version);
```

`createApiClient(baseUrl, getToken?, options?)`:

- sends `Accept: application/json` and an `X-Request-Id` (UUID) on every request,
- adds `Authorization: Bearer <token>` whenever `getToken()` returns a value (sync or async),
- accepts a custom `fetch` (React Native, tests) and extra static headers.

`toApiError(status, body)` maps an RFC 9457 Problem Details body into the shared `ApiError`
shape (`errorCode`, `message`, `requestId`, `status`, `fieldErrors`).

## Files

| File                | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `src/schema.d.ts`   | generated: `paths`, `components`, `operations` |
| `src/index.ts`      | hand-written: client factory, aliases, error mapping |
