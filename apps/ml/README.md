# OrenjiTrade ML service

FastAPI service that turns a card photo into ranked catalog candidates and detects duplicate
images. It is **optional infrastructure**: the API (`apps/api`) never depends on it being up.
When the model is missing or fails, this service degrades (empty candidates, `degraded: true`,
`ML_UNAVAILABLE` events) instead of erroring, and the API falls back to manual card entry.

Runtime: Python 3.12+ (`python:3.12-slim` in Docker). Architecture context:
`docs/architecture/ARCHITECTURE.md` sections 7 and 9, ADR 0009 (events).

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness: `{"status":"ok"}` |
| GET | `/ready` | Readiness: 200 when the model backend is loaded, 503 otherwise |
| POST | `/v1/identify` | Multipart `file` **or** JSON `{"imageUrl"}` -> ranked candidates |
| POST | `/v1/duplicates` | Multipart `imageA`+`imageB` **or** JSON `{"hashA","hashB"[,"threshold"]}` |
| POST | `/internal/events/pubsub` | Google Pub/Sub push endpoint (`card.scan.requested`) |
| GET | `/docs`, `/openapi.json` | Interactive docs / schema |

Accepted images: `image/jpeg`, `image/png`, `image/webp`, up to `MAX_IMAGE_BYTES` and
`MAX_IMAGE_SIDE_PX` per side. Every response carries `X-Request-Id` (echoed when the caller
sends one, generated otherwise).

`POST /v1/identify` response:

```json
{
  "requestId": "3f1c…",
  "candidates": [
    {"game": "mtg", "cardName": "Saltmarsh Archivist", "setCode": "ORJ", "collectorNumber": "061",
     "rarity": "uncommon", "edition": "nonfoil", "language": "EN", "confidence": 0.81}
  ],
  "modelVersion": "stub-0.1.0",
  "degraded": false,
  "processingMs": 12
}
```

`POST /v1/duplicates` response: `{"requestId","distance","isDuplicate","threshold","hashA","hashB","algorithm":"dhash"}`.
Hashes are 64-bit dHashes as 16 hex characters; `distance` is the Hamming distance (0 = identical,
about 10 = near duplicate, unrelated images score around 32).

## Run

macOS and Linux (Python 3.12+; on macOS the system `python3` is 3.9, so name the version):

```bash
cd apps/ml
python3.12 -m venv .venv
.venv/bin/python -m pip install -U pip
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env                                  # optional, defaults work
.venv/bin/uvicorn app.main:app --reload --port 8000
```

Windows (Git Bash): the same with `python` and `.venv/Scripts/` in place of `.venv/bin/`:

```bash
cd apps/ml
python -m venv .venv
.venv/Scripts/python -m pip install -U pip
.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env                                  # optional, defaults work
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

Docker:

```bash
docker build -t orenjitrade-ml apps/ml
docker run --rm -p 8000:8000 -e API_BASE_URL=http://host.docker.internal:8080 orenjitrade-ml
```

The image runs as a non-root user, honours `PORT`, and has a `HEALTHCHECK` on `/health`.

## Test, lint, type-check

```bash
# macOS / Linux; on Windows use .venv/Scripts/ in place of .venv/bin/
.venv/bin/ruff check .
.venv/bin/ruff format --check .
.venv/bin/mypy app
.venv/bin/pytest -q --cov=app --cov-fail-under=85
```

Tests use the deterministic stub backend, generated images (Pillow) and `respx` for outbound
HTTP; nothing needs the network. Starlette 1.x's `TestClient` uses `httpx2`; the service itself
uses `httpx` for outbound calls.

## Configuration

All settings are environment variables (or a local `.env`, see `.env.example`). None is secret
except `SERVICE_AUTH_TOKEN`, which is optional.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8000` | HTTP port (Cloud Run injects it) |
| `LOG_LEVEL` | `INFO` | `CRITICAL`/`ERROR`/`WARNING`/`INFO`/`DEBUG` |
| `MODEL_BACKEND` | `stub` | `stub` (deterministic fixtures) or `torch` (placeholder, not ready) |
| `MODEL_VERSION` | `stub-0.1.0` | Reported in responses and events |
| `API_BASE_URL` | `http://localhost:8080` | Where `CardScanCompleted` results are posted |
| `SERVICE_AUTH_TOKEN` | empty | Shared secret for `/internal/*` (`X-Service-Token`), also sent to the API |
| `MAX_IMAGE_BYTES` | `8388608` | Per-image byte limit (413 `IMAGE_TOO_LARGE` beyond it) |
| `MAX_IMAGE_SIDE_PX` | `8192` | Decompression-bomb guard |
| `IMAGE_URL_ALLOWED_HOSTS` | empty | Optional allow-list for `imageUrl`/`imageUri` hosts |
| `IMAGE_FETCH_TIMEOUT_SECONDS` | `5` | Timeout for downloading images |
| `API_TIMEOUT_SECONDS` | `5` | Timeout for posting results to the API |
| `DUPLICATE_THRESHOLD` | `10` | Hamming distance at or below which images are duplicates |

Image URLs are fetched over `http(s)` only, redirects are not followed, and a host allow-list
can be enforced. In the cloud the service is reachable only through Pub/Sub push and
authenticated service-to-service calls.

## Degradation behaviour

| Situation | `/v1/identify` | Pub/Sub flow (`CardScanCompleted.status`) |
| --- | --- | --- |
| Model backend raises | 200, `degraded: true`, `candidates: []`, WARNING log | `ML_UNAVAILABLE` |
| Backend not ready (`MODEL_BACKEND=torch`) | same as above; `/ready` returns 503 | `ML_UNAVAILABLE` |
| `gs://` image URI | n/a | `ML_UNAVAILABLE` (TODO: Cloud Storage client) |
| Image cannot be fetched/decoded/too large | 502 / 422 / 413 problem | `FAILED` with a safe `reason` |
| API rejects or cannot receive the result | n/a | logged at ERROR, message still acked |
| Unexpected exception | 500 `INTERNAL_ERROR` problem, no stack trace | logged with traceback, message acked |

Model failures are never reported as HTTP 5xx from `/v1/identify`.

## Event contracts

Wire format is camelCase JSON. Python models live in `app/events/models.py`.

**Inbound `card.scan.requested`** (Pub/Sub push envelope, attribute `type=card.scan.requested`,
`message.data` is base64 JSON):

```json
{"scanId": "…", "userId": "…", "imageUri": "https://…", "requestedAt": "2026-09-29T10:00:00Z"}
```

**Outbound `CardScanCompleted`** -> `POST {API_BASE_URL}/internal/ml/scan-results`
(headers `X-Request-Id`, `X-Service-Token` when configured):

```json
{
  "scanId": "…",
  "status": "COMPLETED | FAILED | ML_UNAVAILABLE",
  "candidates": [ {"game": "…", "cardName": "…", "…": "…", "confidence": 0.81} ],
  "modelVersion": "stub-0.1.0",
  "completedAt": "2026-09-29T10:00:05Z",
  "reason": null
}
```

Push endpoint semantics: every readable message is acknowledged with **204**, including
malformed envelopes and unknown event types (logged, no retry storm). Processing is idempotent,
so at-least-once delivery is safe: the API deduplicates by `scanId`. The only non-2xx answer is
**401** when `SERVICE_AUTH_TOKEN` is configured and the `X-Service-Token` header is missing or
wrong, so a misconfigured subscription retries instead of silently dropping work.

## Errors

Every error is an RFC 9457 problem (`application/problem+json`):

```json
{"type": "urn:orenjitrade:problem:image-too-large", "title": "Content Too Large", "status": 413,
 "detail": "file exceeds the maximum size of 8388608 bytes.", "errorCode": "IMAGE_TOO_LARGE",
 "message": "file exceeds the maximum size of 8388608 bytes.", "requestId": "…", "timestamp": "…"}
```

Validation failures use `errorCode: VALIDATION_FAILED` and add `errors: [{field, message, code}]`.
Unhandled exceptions return `INTERNAL_ERROR` with a generic message; the traceback goes to the
ERROR log with the same `requestId`.

## Logging

One JSON object per line on stdout: `timestamp`, `level`, `logger`, `message`, `requestId`,
`module`, `service`, plus any `extra=` fields (`scanId`, `eventType`, `errorCode`, ...).
Uvicorn's loggers are routed through the same formatter.

## Layout

```
app/
  main.py            create_app(): middleware, handlers, routers, lifespan
  config.py          pydantic-settings Settings
  observability.py   X-Request-Id middleware + JSON logging
  errors.py          Problem Details handlers, ApiError
  api/               health, identify, duplicates, pubsub, images (intake), deps
  ml/                identifier (protocol, stub, torch placeholder), hashing, fixtures, service
  events/            models (contracts), scan_worker (process + deliver)
tests/               pytest suite (coverage gate 85%)
```

## Roadmap / known gaps

- `TorchCardIdentifier` is a placeholder; a real model needs weights, a catalog embedding index
  and a `MODEL_VERSION` bump.
- `gs://` image URIs are not fetched yet (reported as `ML_UNAVAILABLE`).
- Fixture cards are fictional placeholders until the catalog seed (Phase 2) exists.
