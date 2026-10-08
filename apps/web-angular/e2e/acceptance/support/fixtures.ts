import { Browser, BrowserContext, Locator, Page, test as base, expect } from '@playwright/test';
import { MAP_PROVIDER_HOSTS, signInThroughUi } from '../../support/stack';
import type { Place } from './places';
import { AcceptanceApi, Collector } from './api';
import { PrivacyScanner } from './privacy';

/**
 * The acceptance suite's `test`: every test gets
 *
 * - `privacy` (automatic): the ADR 0017 network scanner attached to the default browser context,
 *   every context opened through `actors`, and every answer of the `api` shortcuts. The test fails
 *   in the fixture's teardown when any response carried a coordinate, a distance or a radius, a
 *   registered city outside its owner's profile, or when a page called a map provider.
 * - `api`: seeding shortcuts (fresh emulator collectors, binders, items, conversations, staff,
 *   internal jobs); staff roles are taken back and published binders unpublished afterwards.
 * - `actors`: extra signed-in browser contexts for two-party scenarios (closed afterwards).
 *
 * Requests to map providers or tile servers are aborted in every context (the region map draws the
 * bundled boundary files only; the scanner reports any such call), and the catalog's placeholder
 * card pictures are served from memory: the API counts each picture against the anonymous per-IP
 * rate limit the parallel suite shares (card data still comes from the real API).
 */
const STUB_CARD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680"><rect width="488" height="680" rx="24" fill="#fde7d4"/></svg>';

export async function prepareContext(context: BrowserContext): Promise<void> {
  await context.route(MAP_PROVIDER_HOSTS, (route) => route.abort());
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
        `ADR 0017: data that must never reach a client\n${scanner.report()}`,
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

/**
 * Opens the region map on a state or province (`/map?region=&subdivision=`) and returns its binder
 * panel, once its heading ("Arkansas, United States") is shown.
 */
export async function openState(page: Page, place: Place): Promise<Locator> {
  await page.goto(`/map?region=${place.regionCode}&subdivision=${place.subdivisionCode}`);
  const panel = page.getByTestId('subdivision-panel');
  await expect(panel.getByRole('heading', { name: place.label })).toBeVisible({ timeout: 20_000 });
  return panel;
}

/** The binder card of a state panel holding `binderName`. */
export function stateBinder(panel: Locator, binderName: string): Locator {
  return panel.getByRole('listitem').filter({ hasText: binderName });
}
