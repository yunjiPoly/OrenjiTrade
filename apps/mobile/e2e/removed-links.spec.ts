import type { Page } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  createOnboardedCollector,
  PLACES,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/** What a link to a screen of the paid features says (stage F1, ADR 0019). */
const FREE_NOTE =
  'OrenjiTrade is free for every collector now: there is no Premium, credits or donations.';
/** What a link to an offer, trade, payment or dispute screen says (stage R1, ADR 0018). */
const DEALS_NOTE =
  'Offers and trades are no longer in the app. Deals happen in the chat, in Messages.';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** A link the app follows like a tapped one (not `openInApp`: these move on at once). */
async function follow(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  }, path);
}

/**
 * Two stages removed screens from the phone at the same time: R1 offers, trades, protected
 * payments and disputes (ADR 0018), F1 Premium, credits, "Support OrenjiTrade" and their checkouts
 * (ADR 0019). One mechanism (`src/navigation/removedRoutes.ts`, through the not-found screen) sends
 * an old link of either to a screen that exists, with the stage's note, never to "This page does
 * not exist".
 */
test.describe('mobile: links to the screens that left the phone', () => {
  requireStack();

  test('Premium, credits, support and checkout links land on Profile, deals links on Messages', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const ada = await createOnboardedCollector(request, 'rmla', `Ada Links ${suffix()}`, {
      location: PLACES.quebec,
    });
    await signInThroughUi(page, ada.email, ada.password);
    await expect(screen(page, 'map')).toBeVisible({ timeout: 30_000 });

    for (const path of ['/premium?checkout=success', '/credits', '/checkout/fake-donation/x1']) {
      await follow(page, path);
      await expect(page).toHaveURL(/\/profile$/, { timeout: 30_000 });
      await expect(screen(page, 'profile')).toBeVisible({ timeout: 30_000 });
      await expect(snackbar(page)).toHaveText(FREE_NOTE, { timeout: 30_000 });
      await expect(page.getByText('This page does not exist')).toHaveCount(0);
      // The Profile tab offers none of them.
      await expect(
        screen(page, 'profile').getByText(/Premium|Credits|Support OrenjiTrade/)
      ).toHaveCount(0);
    }

    await follow(page, '/trades');
    await expect(page).toHaveURL(/\/messages$/, { timeout: 30_000 });
    await expect(snackbar(page)).toHaveText(DEALS_NOTE, { timeout: 30_000 });
    await expect(page.getByText('This page does not exist')).toHaveCount(0);
  });
});
