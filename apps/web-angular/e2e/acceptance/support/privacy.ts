import { BrowserContext, Page, Response, WebSocket } from '@playwright/test';
import { MAP_PROVIDER_HOSTS, coordinates, domCoordinateFindings } from '../../support/stack';

/**
 * ADR 0017 network scanner shared by every acceptance test (wired as an automatic fixture in
 * `fixtures.ts`). It reads every JSON document that reaches a browser context of the test (HTTP
 * responses and the STOMP frames of the realtime WebSocket) and every JSON answer of the API
 * seeding shortcuts, and records a violation for:
 *
 * - any `lat`/`lng`/`latitude`/`longitude` number: the platform stores and returns no coordinate;
 * - any distance or radius field (`distance`, `distanceKm`, `distanceBucket`, `radiusKm`, ...);
 * - a city registered by the test (a collector's self-declared city) anywhere except that
 *   collector's own public profile (`GET /collectors/{handle}`) and the owner-only answers of
 *   `/me/location` and `/me/export`;
 * - on request ({@link PrivacyScanner.scanDom}), any DOM attribute of a page holding a number in
 *   coordinate range with more than 3 decimals (aria labels, titles, data attributes, links, ...).
 *
 * The bundled boundary files (`/boundaries/*.json`) are static map shapes, not personal data: they
 * have no `lat`/`lng` keys and are counted like any other document.
 *
 * The fixture fails the test in its teardown when a violation was recorded.
 */

export interface Violation {
  source: string;
  path: string;
  reason: string;
}

/** Keys that would describe a distance or a radius. */
const DISTANCE_KEY =
  /^(distances?|distance_?(km|m|meters|metres|bucket)|distanceBucket|radius(_?km|Km|_?m)?)$/i;

/** Owner-only answers that legitimately carry the owner's own city. */
const OWNER_ONLY = /\/api\/v1\/me\/(location|export)(\/|\?|$)/;

/** Every key of a JSON document matching `pattern`, with its path. */
function* keysMatching(
  value: unknown,
  pattern: RegExp,
  path = '$',
): Generator<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      yield* keysMatching(value[i], pattern, `${path}[${i}]`);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (pattern.test(key)) {
        yield { path: `${path}.${key}`, value: child };
      } else {
        yield* keysMatching(child, pattern, `${path}.${key}`);
      }
    }
  }
}

/** Number of objects that look like a public place (`subdivisionCode` + `label`). */
function countPlaces(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum: number, entry) => sum + countPlaces(entry), 0);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const own = typeof record['subdivisionCode'] === 'string' ? 1 : 0;
    return Object.values(record).reduce((sum: number, entry) => sum + countPlaces(entry), own);
  }
  return 0;
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
  private readonly cities: { owner: string; city: string }[] = [];
  private readonly found: Violation[] = [];
  /** Documents seen, kept to check cities registered after they arrived. */
  private readonly documents: { source: string; text: string }[] = [];
  private readonly forgivenSources = new Set<string>();
  private readonly pending: Promise<void>[] = [];
  private readonly attached = new WeakSet<object>();
  private placeCount = 0;
  private documentCount = 0;
  private frameCount = 0;
  private domAttributeCount = 0;

  /**
   * Registers a collector's self-declared city (`owner` is their handle): it may appear only on
   * that collector's own profile. Checked against everything scanned during the test, including
   * what arrived before the registration.
   */
  registerCity(owner: string, city: string): void {
    this.cities.push({ owner, city });
  }

  /** Number of public places checked so far (to prove a scenario really saw where people are). */
  get checkedPlaces(): number {
    return this.placeCount;
  }

  /** Number of JSON documents checked so far. */
  get checkedDocuments(): number {
    return this.documentCount;
  }

  /** Number of realtime (STOMP over WebSocket) JSON bodies checked so far. */
  get checkedFrames(): number {
    return this.frameCount;
  }

  /** Number of DOM attributes checked by {@link scanDom} so far. */
  get checkedDomAttributes(): number {
    return this.domAttributeCount;
  }

  /**
   * Checks every DOM attribute of `page` (except purely geometric ones: inline styles and SVG
   * path data, which hold screen pixels) for a coordinate with more than 3 decimals; returns the
   * number of attributes checked.
   */
  async scanDom(page: Page): Promise<number> {
    const source = `DOM of ${page.url()}`;
    const { findings, scanned } = await domCoordinateFindings(page);
    this.domAttributeCount += scanned;
    for (const finding of findings) {
      this.found.push({
        source,
        path: `<${finding.element} ${finding.attribute}>`,
        reason: `"${finding.value}" holds a coordinate`,
      });
    }
    return scanned;
  }

  /** Every violation recorded so far (coordinates and distances, then cities). */
  violations(): Violation[] {
    const leaks: Violation[] = [];
    for (const document of this.documents) {
      for (const { owner, city } of this.cities) {
        const ownProfile = new RegExp(`/api/v1/collectors/${owner}(\\?|$)`).test(document.source);
        if (!ownProfile && !OWNER_ONLY.test(document.source) && document.text.includes(city)) {
          leaks.push({
            source: document.source,
            path: '$',
            reason: `the city of @${owner} ("${city}") outside their own profile`,
          });
        }
      }
    }
    return [...this.found, ...leaks].filter(
      (violation) => !this.forgivenSources.has(violation.source),
    );
  }

  /** Scans one JSON document received from `source` (a URL or a WebSocket description). */
  scan(source: string, body: unknown): void {
    this.documentCount++;
    this.placeCount += countPlaces(body);
    for (const sample of coordinates(body)) {
      this.found.push({
        source,
        path: sample.path,
        reason: `${sample.value} is a coordinate (none may reach a client)`,
      });
    }
    for (const distance of keysMatching(body, DISTANCE_KEY)) {
      this.found.push({
        source,
        path: distance.path,
        reason: `distance or radius field (${JSON.stringify(distance.value)})`,
      });
    }
    this.documents.push({ source, text: JSON.stringify(body) });
  }

  /** Scans every JSON response and STOMP frame of a browser context (current and future pages). */
  attach(context: BrowserContext): void {
    if (this.attached.has(context)) {
      return;
    }
    this.attached.add(context);
    context.on('response', (response) => this.onResponse(response));
    context.on('request', (request) => {
      if (MAP_PROVIDER_HOSTS.test(request.url())) {
        this.found.push({
          source: request.url(),
          path: '(request)',
          reason: 'a map provider or tile server was called',
        });
      }
    });
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
