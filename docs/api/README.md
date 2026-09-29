# API conventions

Base URL: `https://api.orenjitrade.com/api/v1` (local: `http://localhost:8080/api/v1`).
The OpenAPI document `openapi.json` in this folder is generated from code
(`cd apps/api && ./gradlew exportOpenApi`) and is the single contract for
`packages/api-client` (Angular) and `packages/shared-types` (mobile).

## Authentication

`Authorization: Bearer <Firebase ID token>`. Unauthenticated requests to protected routes get
`401` with `errorCode=UNAUTHENTICATED`. Suspended accounts get `403 ACCOUNT_SUSPENDED`. Routes
needing accepted terms return `428 TERMS_ACCEPTANCE_REQUIRED`. Public routes live under
`/api/v1/public/**` plus `/api/v1/meta`. Admin routes live under `/api/v1/admin/**` and require
`ADMIN`/`SUPER_ADMIN` (moderation subset for `MODERATOR`). Internal routes (`/internal/**`) are
for Cloud Scheduler / Pub/Sub / ML with OIDC or a service token; never exposed through Cloudflare.

## Errors — RFC 9457 Problem Details

Every error body is `application/problem+json`:

```json
{
  "type": "https://api.orenjitrade.com/problems/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "quantity must be at least 1",
  "instance": "/api/v1/inventory/items",
  "errorCode": "VALIDATION_FAILED",
  "message": "quantity must be at least 1",
  "requestId": "1f2c…",
  "timestamp": "2026-09-29T14:02:11.120Z",
  "errors": [{ "field": "quantity", "message": "must be at least 1" }]
}
```

No stack traces, SQL, or class names. `requestId` equals the `X-Request-Id` response header
(send your own to correlate; otherwise the server generates one).

| errorCode | HTTP |
| --- | --- |
| VALIDATION_FAILED | 400 |
| UNAUTHENTICATED | 401 |
| FORBIDDEN, ACCOUNT_SUSPENDED | 403 |
| NOT_FOUND | 404 |
| CONFLICT | 409 |
| PAYLOAD_TOO_LARGE | 413 |
| UNSUPPORTED_MEDIA_TYPE | 415 |
| TERMS_ACCEPTANCE_REQUIRED | 428 |
| RATE_LIMITED, LIMIT_REACHED (freemium; includes `limit`, `used`, `upgradeUrl` extensions) | 429 |
| INTERNAL_ERROR | 500 |
| SERVICE_UNAVAILABLE | 503 |

## Pagination

- Offset: `?page=0&size=20` → `{ items, page, size, totalItems, totalPages }` (admin lists, catalog).
- Cursor: `?cursor=<opaque>&limit=20` → `{ items, nextCursor }` (feeds, messages, notifications).
  Cursors are opaque base64 strings; never construct them client side.

## Geography

Requests take `lat`, `lng`, `radiusKm` (bounded by the caller's plan). Responses only ever
contain `publicPoint` (≤ 3 decimals), `distanceBucket` (`LT_1KM`, `KM_1_5`, `KM_5_10`,
`KM_10_25`, `KM_25_50`, `GT_50KM`), and `publicLabel`. Exact coordinates are never returned
(ADR 0004).

## Versioning and compatibility

Path-versioned (`/api/v1`). Additive changes (new optional fields) are non-breaking; removing
or renaming fields requires `/api/v2` for that resource. Clients must ignore unknown fields.

## Rate limiting

Redis token buckets per user and per IP per route group. Responses include
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` on 429.

## Idempotency

Mutating endpoints that may be retried (offers, payments, report submission) accept
`Idempotency-Key`; the same key within 24 h returns the original response.
