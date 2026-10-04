/**
 * A fake OrenjiTrade API behind `globalThis.fetch` (the app's client resolves fetch per call).
 * Routes are `'METHOD /api/v1/path'` (query strings ignored; `{id}` segments match anything).
 * A handler is a fixed answer, a function of the request, or a list consumed one answer per call
 * (the last one repeats).
 */
export interface MockAnswer {
  status?: number;
  body?: unknown;
  /** Defaults to `application/json` (`application/problem+json` for problems). */
  contentType?: string;
}

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

export type MockHandler = MockAnswer | ((request: MockRequest) => MockAnswer | Promise<MockAnswer>);

export type MockRoutes = Record<string, MockHandler | MockHandler[]>;

export interface MockApi {
  fetch: jest.Mock;
  /** Every request received, in order. */
  calls: MockRequest[];
  /** Requests of one route (`'PUT /api/v1/me/profile'`). */
  callsTo: (route: string) => MockRequest[];
  /** Adds or replaces routes. */
  use: (routes: MockRoutes) => void;
}

export function ok(body: unknown, status = 200): MockAnswer {
  return { status, body };
}

/** An RFC 9457 problem as the API sends it. */
export function problem(
  status: number,
  errorCode: string,
  message: string,
  extra: Record<string, unknown> = {}
): MockAnswer {
  return {
    status,
    contentType: 'application/problem+json',
    body: {
      type: 'about:blank',
      title: errorCode,
      status,
      errorCode,
      message,
      requestId: 'req-test',
      timestamp: '2026-10-04T12:00:00Z',
      ...extra,
    },
  };
}

export const noContent: MockAnswer = { status: 204 };

function matches(pattern: string, path: string): boolean {
  const expected = pattern.split('/');
  const actual = path.split('/');
  return (
    expected.length === actual.length &&
    expected.every((segment, index) =>
      /^\{.+\}$/.test(segment) ? (actual[index] ?? '').length > 0 : segment === actual[index]
    )
  );
}

async function readBody(request: Request): Promise<unknown> {
  const text = await request.text().catch(() => '');
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Installs the fake API on `globalThis.fetch`; restore with `jest.restoreAllMocks()` or a new call. */
export function mockApi(initial: MockRoutes = {}): MockApi {
  const routes: MockRoutes = { ...initial };
  const counters = new Map<string, number>();
  const calls: MockRequest[] = [];

  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const recorded: MockRequest = {
      method: request.method.toUpperCase(),
      path: url.pathname,
      query: url.searchParams,
      headers: request.headers,
      body: await readBody(request.clone()),
    };
    calls.push(recorded);
    const key = Object.keys(routes).find((route) => {
      const [method, pattern = ''] = route.split(' ');
      return method === recorded.method && matches(pattern, recorded.path);
    });
    if (!key) {
      return new Response(
        JSON.stringify({
          status: 404,
          errorCode: 'NOT_FOUND',
          message: `No mock for ${recorded.method} ${recorded.path}`,
        }),
        { status: 404, headers: { 'content-type': 'application/problem+json' } }
      );
    }
    const entry = routes[key];
    let handler: MockHandler | undefined;
    if (Array.isArray(entry)) {
      const index = counters.get(key) ?? 0;
      counters.set(key, index + 1);
      handler = entry[Math.min(index, entry.length - 1)];
    } else {
      handler = entry;
    }
    const answer = typeof handler === 'function' ? await handler(recorded) : (handler ?? {});
    const status = answer.status ?? 200;
    if (status === 204 || answer.body === undefined) {
      return new Response(null, { status });
    }
    const contentType =
      answer.contentType ?? (status >= 400 ? 'application/problem+json' : 'application/json');
    return new Response(JSON.stringify(answer.body), {
      status,
      headers: { 'content-type': contentType },
    });
  });

  globalThis.fetch = fetchMock as unknown as typeof fetch;

  return {
    fetch: fetchMock,
    calls,
    callsTo: (route) => {
      const [method, pattern = ''] = route.split(' ');
      return calls.filter((call) => call.method === method && matches(pattern, call.path));
    },
    use: (more) => {
      Object.assign(routes, more);
      for (const key of Object.keys(more)) {
        counters.delete(key);
      }
    },
  };
}
