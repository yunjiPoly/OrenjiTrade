import { BrowserContext, Page, Response, WebSocket } from '@playwright/test';
import { coordinates, decimalsOf } from '../../support/stack';

/**
 * ADR 0004 network scanner shared by every acceptance test (wired as an automatic fixture in
 * `fixtures.ts`). It reads every JSON document that reaches a browser context of the test (HTTP
 * responses and the STOMP frames of the realtime WebSocket) and every JSON answer of the API
 * seeding shortcuts, and records a violation for:
 *
 * - any `lat`/`lng`/`latitude`/`longitude` number with more than 3 decimals;
 * - any `lat`/`lng` pair equal to a stored trading-area centre registered by the test (the private
 *   centre a collector chose). The only exemption is the owner's own `/api/v1/me/location`
 *   answers, which by design return the owner's chosen area to the owner;
 * - any raw numeric distance (`distance`, `distanceKm`, `distanceMeters`, …): distances reach
 *   clients as buckets (`distanceBucket`) only.
 *
 * The fixture fails the test in its teardown when a violation was recorded.
 */

export interface Point {
  lat: number;
  lng: number;
}

export interface Violation {
  source: string;
  path: string;
  reason: string;
}

interface Sample {
  path: string;
  value: number;
}

/** Answers that return the caller's own chosen trading area (owner only, by design). */
const OWNER_LOCATION = /\/api\/v1\/me\/location(\/|\?|$)/;

/** Numeric fields that would be a raw (unbucketed) distance. */
const RAW_DISTANCE = /^distances?(_?(in)?_?(km|m|meters|metres|kilometers|kilometres))?$/i;

/** Every numeric field of a JSON document whose key looks like a raw distance. */
function* rawDistances(value: unknown, path = '$'): Generator<{ path: string; value: number }> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield* rawDistances(value[i], `${path}[${i}]`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (RAW_DISTANCE.test(key) && typeof child === 'number') {
        yield { path: `${path}.${key}`, value: child };
      } else {
        yield* rawDistances(child, `${path}.${key}`);
      }
    }
  }
}

/** Pairs `lat`/`lng` samples of the same parent object. */
function pairs(samples: readonly Sample[]): (Point & { path: string })[] {
  const byParent = new Map<string, Partial<Point>>();
  for (const sample of samples) {
    const parent = sample.path.replace(/\.(lat|lng|latitude|longitude)$/i, '');
    const entry = byParent.get(parent) ?? {};
    if (/\.(lat|latitude)$/i.test(sample.path)) {
      entry.lat = sample.value;
    } else {
      entry.lng = sample.value;
    }
    byParent.set(parent, entry);
  }
  return [...byParent.entries()]
    .filter(([, point]) => point.lat !== undefined && point.lng !== undefined)
    .map(([path, point]) => ({ path, lat: point.lat!, lng: point.lng! }));
}

/** The JSON bodies of a STOMP frame (`COMMAND\nheaders\n\nbody\0`, possibly several per frame). */
export function stompBodies(payload: string): unknown[] {
  const bodies: unknown[] = [];
  for (const frame of payload.split('\0')) {
    const separator = frame.indexOf('\n\n');
    if (separator < 0) {
      continue;
    }
    const body = frame.slice(separator + 2).trim();
    if (!body.startsWith('{') && !body.startsWith('[')) {
      continue;
    }
    try {
      bodies.push(JSON.parse(body));
    } catch {
      // Not JSON (or a partial frame): nothing to scan.
    }
  }
  return bodies;
}

export class PrivacyScanner {
  private readonly centres: (Point & { owner: string })[] = [];
  private readonly precision: Violation[] = [];
  private readonly points: (Point & { source: string; path: string })[] = [];
  private readonly forgivenSources = new Set<string>();
  private readonly pending: Promise<void>[] = [];
  private readonly attached = new WeakSet<object>();
  private coordinateCount = 0;
  private documentCount = 0;
  private frameCount = 0;

  /**
   * Registers a stored (private) trading-area centre that must never reach a client. Checked
   * against everything scanned during the test, including what arrived before the registration.
   */
  registerCentre(owner: string, centre: Point): void {
    this.centres.push({ owner, lat: centre.lat, lng: centre.lng });
  }

  /** Number of coordinates checked so far (to prove a scenario really saw geo data). */
  get checkedCoordinates(): number {
    return this.coordinateCount;
  }

  /** Number of JSON documents checked so far. */
  get checkedDocuments(): number {
    return this.documentCount;
  }

  /** Number of realtime (STOMP over WebSocket) JSON bodies checked so far. */
  get checkedFrames(): number {
    return this.frameCount;
  }

  /** Every violation recorded so far (precision, then stored centres). */
  violations(): Violation[] {
    const leaks: Violation[] = [];
    for (const point of this.points) {
      const centre = this.centres.find(
        (candidate) => candidate.lat === point.lat && candidate.lng === point.lng,
      );
      if (centre) {
        leaks.push({
          source: point.source,
          path: point.path,
          reason: `(${point.lat}, ${point.lng}) is the stored trading-area centre of ${centre.owner}`,
        });
      }
    }
    return [...this.precision, ...leaks].filter(
      (violation) => !this.forgivenSources.has(violation.source),
    );
  }

  /** Scans one JSON document received from `source` (a URL or a WebSocket description). */
  scan(source: string, body: unknown): void {
    this.documentCount++;
    const samples = [...coordinates(body)];
    this.coordinateCount += samples.length;
    for (const sample of samples) {
      const decimals = decimalsOf(sample.value);
      if (decimals > 3) {
        this.precision.push({
          source,
          path: sample.path,
          reason: `${sample.value} has ${decimals} decimals (at most 3 allowed)`,
        });
      }
    }
    for (const distance of rawDistances(body)) {
      this.precision.push({
        source,
        path: distance.path,
        reason: `raw distance ${distance.value} (distances reach clients as buckets only)`,
      });
    }
    if (OWNER_LOCATION.test(source)) {
      return; // the owner's own chosen area, returned to the owner by design
    }
    for (const point of pairs(samples)) {
      this.points.push({ source, ...point });
    }
  }

  /** Scans every JSON response and STOMP frame of a browser context (current and future pages). */
  attach(context: BrowserContext): void {
    if (this.attached.has(context)) {
      return;
    }
    this.attached.add(context);
    context.on('response', (response) => this.onResponse(response));
    for (const page of context.pages()) {
      this.attachPage(page);
    }
    context.on('page', (page) => this.attachPage(page));
  }

  /** Ignores what `source` delivered (only for the scanner's own self-test probe). */
  forgiveSource(source: string): void {
    this.forgivenSources.add(source);
  }

  /** Waits for the bodies still being read (bounded: an aborted response never hangs a test). */
  async settle(): Promise<void> {
    const bounded = (promise: Promise<void>) =>
      Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, 5_000))]);
    while (this.pending.length > 0) {
      const batch = this.pending.splice(0, this.pending.length);
      await Promise.all(batch.map(bounded));
    }
  }

  /** A readable report of the violations (empty string when clean). */
  report(): string {
    return this.violations()
      .map((violation) => `- ${violation.reason} at ${violation.path} in ${violation.source}`)
      .join('\n');
  }

  private attachPage(page: Page): void {
    if (this.attached.has(page)) {
      return;
    }
    this.attached.add(page);
    page.on('websocket', (socket) => this.attachSocket(socket));
  }

  private attachSocket(socket: WebSocket): void {
    socket.on('framereceived', ({ payload }) => {
      const text = typeof payload === 'string' ? payload : payload.toString('utf8');
      for (const body of stompBodies(text)) {
        this.frameCount++;
        this.scan(`websocket ${socket.url().split('?')[0]}`, body);
      }
    });
  }

  private onResponse(response: Response): void {
    const type = response.headers()['content-type'] ?? '';
    if (!type.includes('json')) {
      return;
    }
    const url = response.url();
    this.pending.push(
      response
        .json()
        .then((body: unknown) => this.scan(url, body))
        .catch(() => undefined),
    );
  }
}
