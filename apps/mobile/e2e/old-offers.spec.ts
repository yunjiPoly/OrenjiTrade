import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiDeclineOffer,
  apiListItem,
  apiMakeOffer,
  apiPublicBinder,
  authHeader,
  cardOfPrinting,
  createOnboardedCollector,
  openInApp,
  openTab,
  PLACES,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/** What every old offer, trade, payment or dispute link and notification says (ADR 0018). */
const DEALS_NOTE =
  'Offers and trades are no longer in the app. Deals happen in the chat, in Messages.';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/**
 * Offers left the phone (stage R1, ADR 0018: deals happen in the chat), but the API keeps them for
 * the paused web, so a conversation and the notification centre can still hold old ones. Ben
 * (driven through the API) makes an offer on Ada's public card and Ada declines it through the
 * API: the pair conversation gets the API's offer lines and Ada an OFFER_RECEIVED notification.
 * On the phone the offer lines read "Offer (no longer available)", the notification opens nothing
 * and says why, an old offer link lands on Messages, and the app never calls the offer routes.
 */
test.describe('mobile: old offers after offers left the phone', () => {
  requireStack();

  test('old offer messages, notifications and links never crash or open a removed screen', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const ada = await createOnboardedCollector(request, 'oofa', `Ada Seller ${suffix()}`, {
      location: PLACES.quebec,
      discoverable: true,
    });
    const ben = await createOnboardedCollector(request, 'oofb', `Ben Buyer ${suffix()}`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    const { printingId } = await cardOfPrinting(request, ada.idToken, 'PFT-002');
    const binderId = await apiPublicBinder(request, ada, 'Old offers binder');
    const item = await apiListItem(request, ada, binderId, printingId, {
      availability: 'TRADE_OR_SALE',
      askingPrice: 45,
      acceptsOffers: true,
    });
    const offer = await apiMakeOffer(request, ben, item.id, 40, 'Would you take 40?');
    await apiDeclineOffer(request, ada, offer.id, 'Keeping it for now.');

    const offerCalls: string[] = [];
    page.on('request', (candidate) => {
      if (/\/api\/v1\/(offers|trades|disputes|payments)\b/.test(candidate.url())) {
        offerCalls.push(candidate.url());
      }
    });

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Messages');
    const messages = screen(page, 'messages');
    const row = messages.getByTestId(`conversation-row-${ben.handle}`);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.click();
    const thread = screen(page, 'conversation');
    // The offer and its decline: two grey lines, no offer card, no link to an offer screen.
    await expect(thread.getByText('Offer (no longer available)')).toHaveCount(2, {
      timeout: 30_000,
    });
    await expect(thread.getByText(/made an offer|declined the offer/)).toHaveCount(0);
    await expect(thread.getByTestId('offer-link-card')).toHaveCount(0);
    await expect(thread.getByRole('button', { name: /Share an offer/ })).toHaveCount(0);

    // The notification of the offer is still listed; opening it opens nothing and says why.
    let receivedId: string | undefined;
    await expect
      .poll(
        async () => {
          const answer = await request.get(`${API_URL}/api/v1/notifications?limit=20`, {
            headers: authHeader(ada.idToken),
          });
          const body = answer.ok()
            ? ((await answer.json()) as { items: { id: string; type: string }[] })
            : { items: [] };
          receivedId = body.items.find((candidate) => candidate.type === 'OFFER_RECEIVED')?.id;
          return !!receivedId;
        },
        { timeout: 30_000 }
      )
      .toBe(true);
    await openInApp(page, '/notifications');
    const centre = screen(page, 'notifications');
    const entry = centre.getByTestId(`notification-${receivedId ?? ''}`);
    await expect(entry).toBeVisible({ timeout: 30_000 });
    await entry.click();
    await expect(snackbar(page)).toHaveText(DEALS_NOTE, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/notifications$/);

    // An old offer link (a bookmark, `orenjitrade://offers/…`) lands on Messages with the note.
    // (Not `openInApp`: that helper waits for the URL it opened, and this one moves on at once.)
    await page.evaluate((target) => {
      window.history.pushState(null, '', target);
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    }, `/offers/${offer.id}`);
    await expect(page).toHaveURL(/\/messages$/, { timeout: 30_000 });
    await expect(snackbar(page)).toHaveText(DEALS_NOTE, { timeout: 30_000 });
    await expect(page.getByText('This page does not exist')).toHaveCount(0);
    expect(offerCalls).toEqual([]);
  });
});
