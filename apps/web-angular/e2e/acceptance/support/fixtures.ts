import { Browser, BrowserContext, Locator, Page, test as base, expect } from '@playwright/test';
import { signInThroughUi } from '../../support/stack';
import { AcceptanceApi, Collector } from './api';
import { PrivacyScanner } from './privacy';

/**
 * The acceptance suite's `test`: every test gets
 *
 * - `privacy` (automatic): the ADR 0004 network scanner attached to the default browser context,
 *   every context opened through `actors`, and every answer of the `api` shortcuts. The test fails
 *   in the fixture's teardown when any response carried a lat/lng with more than 3 decimals or a
 *   stored trading-area centre registered by the test.
 * - `api`: seeding shortcuts (fresh emulator collectors, binders, items, conversations, staff,
 *   internal jobs); staff roles are taken back and published binders unpublished afterwards.
 * - `actors`: extra signed-in browser contexts for two-party scenarios (closed afterwards).
 *
 * Map tiles and the catalog's placeholder card pictures are served from memory in every context:
 * the OSM tile policy discourages automated bulk loads, and the API counts each picture against the
 * anonymous per-IP rate limit the parallel suite shares (card data still comes from the real API).
 */

/** A transparent 1×1 PNG standing in for map tiles. */
const STUB_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const STUB_CARD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680"><rect width="488" height="680" rx="24" fill="#fde7d4"/></svg>';

export async function prepareContext(context: BrowserContext): Promise<void> {
  await context.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: STUB_TILE }),
  );
  await context.route('**/api/v1/public/placeholder-images/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: STUB_CARD }),
  );
}

export interface Actors {
  /** A new browser context signed in as `collector` through the sign-in page. */
  open(collector: Collector): Promise<Page>;
  /** A new signed-out browser context. */
  anonymous(): Promise<Page>;
}

interface AcceptanceFixtures {
  privacy: PrivacyScanner;
  api: AcceptanceApi;
  actors: Actors;
}

async function newContext(browser: Browser, privacy: PrivacyScanner): Promise<BrowserContext> {
  const context = await browser.newContext();
  await prepareContext(context);
  privacy.attach(context);
  return context;
}

export const test = base.extend<AcceptanceFixtures>({
  privacy: [
    async ({ context }, use) => {
      const scanner = new PrivacyScanner();
      scanner.attach(context);
      await use(scanner);
      await scanner.settle();
      expect(
        scanner.violations(),
        `ADR 0004: coordinates that must never reach a client\n${scanner.report()}`,
      ).toEqual([]);
    },
    { auto: true },
  ],
  context: async ({ context }, use) => {
    await prepareContext(context);
    await use(context);
  },
  api: async ({ request, privacy }, use) => {
    const api = new AcceptanceApi(request, privacy);
    await use(api);
    await api.cleanUp();
  },
  actors: async ({ browser, privacy }, use) => {
    const opened: BrowserContext[] = [];
    await use({
      open: async (collector) => {
        const context = await newContext(browser, privacy);
        opened.push(context);
        const page = await context.newPage();
        await signIn(page, collector);
        return page;
      },
      anonymous: async () => {
        const context = await newContext(browser, privacy);
        opened.push(context);
        return context.newPage();
      },
    });
    await privacy.settle();
    for (const context of opened) {
      await context.close();
    }
  },
});

export { expect };

/** Signs `collector` in through the sign-in page (lands on `/map` or the return URL). */
export async function signIn(page: Page, collector: Pick<Collector, 'email' | 'password'>) {
  await signInThroughUi(page, collector.email, collector.password);
}

/** Waits until the page's STOMP connection is live (messages panel or notification bell). */
export async function expectRealtime(page: Page): Promise<void> {
  await expect(page.getByTestId('notification-bell')).toHaveAttribute(
    'data-realtime',
    'connected',
    { timeout: 20_000 },
  );
}

/**
 * Waits until a dialog holds the focus and returns it. Material dialogs move the focus to their
 * first field when the opening animation ends; text typed before that can land in the wrong field
 * (seen under load: a tracking number appended to the carrier).
 */
export async function dialogReady(dialog: Locator): Promise<Locator> {
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)), {
      message: 'the dialog took the focus',
    })
    .toBe(true);
  return dialog;
}

/** Escapes text for a regular expression. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A collector's avatar marker on the discovery map (a keyboard-focusable button). */
export function mapMarker(page: Page, displayName: string) {
  return page
    .getByTestId('discovery-map')
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(displayName)}`) });
}
