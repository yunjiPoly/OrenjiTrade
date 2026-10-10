import type { Page, Route } from '@playwright/test';

/** One successful JSON answer of the API, as the page received it. */
export interface RecordedAnswer<T> {
  url: string;
  body: T;
}

export interface AnswerRecorder<T> {
  /** Every successful JSON answer so far, in arrival order. */
  readonly received: readonly RecordedAnswer<T>[];
  /** Stops recording: later requests go to the network as usual. */
  stop(): Promise<void>;
}

/**
 * Records the API answers a page receives for the requests matching `url`, read in a route
 * handler: Playwright sends the page's own request (same method, URL, headers and body) with
 * `route.fetch()`, the answer is parsed here, then that very answer is handed to the page with
 * `route.fulfill()`. An answer is therefore recorded before the page can render it, and a spec
 * that has seen the page use it can assert on it right away.
 *
 * Never read such an answer back from the browser instead (`page.waitForResponse()` then
 * `response.json()`): the body comes from Chromium's DevTools network buffer, which does not keep
 * every fetch body. Under the load of a full run the read of a card-holders answer the page had
 * just rendered failed with "No data found for resource with given identifier", although the page
 * had not navigated.
 */
export async function recordAnswers<T = unknown>(
  page: Page,
  url: RegExp,
): Promise<AnswerRecorder<T>> {
  const received: RecordedAnswer<T>[] = [];
  const handler = async (route: Route) => {
    const response = await route.fetch();
    try {
      const type = response.headers()['content-type'] ?? '';
      if (response.ok() && type.includes('json')) {
        received.push({ url: response.url(), body: (await response.json()) as T });
      }
    } finally {
      await route.fulfill({ response });
    }
  };
  await page.route(url, handler);
  return { received, stop: () => page.unroute(url, handler) };
}
