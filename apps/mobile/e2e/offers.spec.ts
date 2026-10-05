import { expect, test } from './support/fixtures';
import {
  apiCollectorRatings,
  apiCompleteTrade,
  apiCounterOffer,
  apiDeclineOffer,
  apiListItem,
  apiMakeOffer,
  apiOffer,
  apiPublicBinder,
  createOnboardedCollector,
  openInApp,
  openTab,
  printingIdOf,
  randomRuralArea,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * Mobile Phases 7 and 8 (offers, trades, ratings) against the real, isolated stack with two
 * fresh fictional collectors. Ada uses the app; Ben (the second user) answers through the API.
 *
 * 1. Ada makes a cash offer on Ben's public card from his binder; Ben counters; Ada's offer
 *    screen follows the counter-offer live, she accepts it, confirms the exchange on the trade;
 *    Ben confirms too and the trade completes live; Ada rates Ben from the trade and writes him a
 *    reference from his profile.
 * 2. Ben offers on Ada's card; Ada finds it in Offers (Received, your turn) and counters it from
 *    the app; Ben declines with a reason: the closed negotiation and its history show it.
 */

const PRINTING = 'PFT-002';

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

function offerIdOf(url: string): string {
  const match = /\/offers\/([\w-]+)/.exec(url);
  expect(match, `offer id in ${url}`).toBeTruthy();
  return match![1]!;
}

test.describe('mobile offers and trades', () => {
  requireStack();

  test('offer → counter → accept → trade → confirm both → rate and reference', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    // Public binders are shown for discoverable owners with a trading area.
    const ben = await createOnboardedCollector(request, 'offs', `Ben Seller ${suffix()}`, {
      area: { ...randomRuralArea(), radiusKm: 5 },
      discoverable: true,
    });
    const ada = await createOnboardedCollector(request, 'offb', `Ada Buyer ${suffix()}`);
    const binderId = await apiPublicBinder(request, ben, `Mobile offers binder ${suffix()}`);
    const item = await apiListItem(
      request,
      ben,
      binderId,
      await printingIdOf(request, ben.idToken, PRINTING),
      { availability: 'TRADE_OR_SALE', askingPrice: 45, acceptsOffers: true, quantity: 2 }
    );
    const card = item.card.name;

    // --- Ada makes a cash offer from Ben's public binder ---------------------------------------
    await signInThroughUi(page, ada.email, ada.password);
    await openInApp(page, `/binders/${binderId}`);
    const binder = screen(page, 'binder');
    await binder.getByRole('button', { name: `Make an offer on ${card}` }).click({
      timeout: 30_000,
    });
    const form = screen(page, 'offer-new');
    await expect(form.getByTestId('offer-target-name')).toHaveText(card);
    await expect(form).toContainText('Asking $45.00');
    await expect(form.getByRole('radio', { name: 'Cash', exact: true })).toBeChecked();
    await form.getByRole('button', { name: 'Send offer' }).click();
    await expect(form.getByText('Enter the amount you offer.')).toBeVisible();
    await form.getByLabel('Amount').fill('38');
    await form.getByLabel(/^Note to /).fill('Could we meet at the library?');
    await expect(form.getByTestId('offer-summary')).toContainText(`$38.00 for ${card}`);
    await form.getByRole('button', { name: 'Send offer' }).click();

    const offerScreen = screen(page, 'offer');
    await expect(offerScreen.getByTestId('offer-eyebrow')).toHaveText(
      `Your offer to ${ben.displayName}`,
      { timeout: 30_000 }
    );
    await expect(snackbar(page)).toHaveText(`Offer sent to ${ben.displayName}.`);
    await expect(offerScreen.getByTestId('offer-turn')).toHaveText(
      `Waiting for ${ben.displayName}`
    );
    await expect(offerScreen.getByTestId('deal-cash')).toHaveText('$38.00');
    const firstOfferId = offerIdOf(page.url());

    // --- Ben counters: the screen follows the live proposal --------------------------------------
    const counter = await apiCounterOffer(request, ben, firstOfferId, 42);
    await expect(offerScreen.getByTestId('offer-notice')).toContainText(
      `${ben.displayName} answered with a counter-offer.`,
      { timeout: 30_000 }
    );
    await expect(page).toHaveURL(new RegExp(`/offers/${counter.id}$`));
    await expect(offerScreen.getByTestId('offer-turn')).toHaveText('Your turn to answer');
    await expect(offerScreen.getByTestId('deal-cash')).toHaveText('$42.00');
    await expect(offerScreen.getByTestId('offer-round')).toHaveText('Round 2');
    await expect(offerScreen.getByTestId('offer-history')).toContainText(
      `${ben.displayName} sent a counter-offer`
    );

    // --- Ada accepts: a trade opens ------------------------------------------------------------
    await offerScreen.getByRole('button', { name: 'Accept', exact: true }).click();
    const accept = page.getByTestId('accept-dialog');
    await expect(accept).toContainText(`for $42.00 with ${ben.displayName}`);
    await accept.getByRole('button', { name: 'Accept offer' }).click();
    await expect(offerScreen.getByTestId('offer-notice')).toContainText(
      'Offer accepted. The trade is open',
      { timeout: 30_000 }
    );
    const accepted = await apiOffer(request, ada, counter.id);
    expect(accepted.status).toBe('ACCEPTED');
    await offerScreen.getByRole('button', { name: 'Go to the trade' }).click();

    // --- The trade: Ada confirms, then Ben ---------------------------------------------------
    const trade = screen(page, 'trade');
    await expect(trade.getByTestId('trade-next-title')).toHaveText(
      'Your move: meet and exchange the cards',
      { timeout: 30_000 }
    );
    await expect(trade.getByTestId('trade-counterparty')).toContainText(ben.displayName);
    await trade.getByRole('button', { name: 'Confirm the exchange' }).click();
    await page
      .getByTestId('complete-dialog')
      .getByRole('button', { name: 'Confirm the exchange' })
      .click();
    await expect(trade.getByTestId('trade-notice')).toContainText(
      `You confirmed the exchange. Waiting for ${ben.displayName} to confirm.`,
      { timeout: 30_000 }
    );
    await expect(trade.getByTestId('trade-next-title')).toHaveText(
      `Waiting for ${ben.displayName}`
    );
    expect((await apiCompleteTrade(request, ben, accepted.tradeId!)).status).toBe('COMPLETED');
    // TRADE_UPDATE arrives over the realtime channel: the trade completes without a reload.
    await expect(trade.getByTestId('trade-next-title')).toHaveText('Trade completed', {
      timeout: 30_000,
    });
    await expect(trade.getByTestId('trade-received')).toContainText(card);

    // --- Ada rates Ben from the trade ----------------------------------------------------------
    await trade.getByRole('button', { name: `Rate ${ben.displayName}` }).click({ timeout: 30_000 });
    const rate = screen(page, 'rate');
    await expect(rate.getByTestId('rate-interaction-line')).toContainText('Completed trade');
    await rate.getByRole('button', { name: 'Submit rating' }).click();
    await expect(rate.getByText('Choose an overall score from 1 to 5 stars.')).toBeVisible();
    await rate.getByTestId('rate-overall-5').click();
    await rate.getByTestId('rate-meetupReliability-4').click();
    await rate.getByLabel('Comment (optional)').fill('On time at the library, card as described.');
    await rate.getByRole('button', { name: 'Submit rating' }).click();
    await expect(snackbar(page)).toHaveText(
      `Thanks! Your rating of ${ben.displayName} is published.`,
      { timeout: 30_000 }
    );
    await expect
      .poll(async () => (await apiCollectorRatings(request, ada, ben.handle)).items)
      .toEqual([
        expect.objectContaining({
          rater: expect.objectContaining({ handle: ada.handle }),
          overall: 5,
          comment: 'On time at the library, card as described.',
        }),
      ]);
    // Only one rating per interaction: the button is gone.
    await expect(trade.getByRole('button', { name: `Rate ${ben.displayName}` })).toHaveCount(0);

    // --- A reference on Ben's profile (≤ 400, banned terms refused) ------------------------------
    await openInApp(page, `/collectors/${ben.handle}`);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('rating-count')).toHaveText('1 rating', { timeout: 30_000 });
    await profile.getByRole('button', { name: 'Write a reference' }).click();
    const reference = screen(page, 'reference');
    await reference.getByLabel('Reference', { exact: true }).fill('A zorblax trader');
    await reference.getByRole('button', { name: 'Publish reference' }).click();
    await expect(reference.getByTestId('reference-error')).toContainText(
      'Your text breaks the community guidelines'
    );
    await reference.getByLabel('Reference', { exact: true }).fill('Friendly, fair and on time.');
    await reference.getByRole('button', { name: 'Publish reference' }).click();
    await expect(snackbar(page)).toHaveText(`Your reference for ${ben.displayName} is published.`, {
      timeout: 30_000,
    });
    await expect(profile.getByText('“Friendly, fair and on time.”')).toBeVisible({
      timeout: 30_000,
    });
    await expect(profile.getByRole('button', { name: 'Write a reference' })).toHaveCount(0);

    // --- The sent offer is listed as accepted ----------------------------------------------------
    await openInApp(page, '/offers?tab=sent&status=accepted');
    const offers = screen(page, 'offers');
    await expect(offers.getByTestId(`offer-row-${counter.id}`)).toContainText('Accepted', {
      timeout: 30_000,
    });
  });

  test('an offer received is countered from the app, then declined with a reason', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const ada = await createOnboardedCollector(request, 'offr', `Ada Receiver ${suffix()}`, {
      area: { ...randomRuralArea(), radiusKm: 5 },
      discoverable: true,
    });
    const ben = await createOnboardedCollector(request, 'offo', `Ben Offerer ${suffix()}`);
    const binderId = await apiPublicBinder(request, ada, `Mobile received binder ${suffix()}`);
    const item = await apiListItem(
      request,
      ada,
      binderId,
      await printingIdOf(request, ada.idToken, PRINTING),
      { availability: 'SALE', askingPrice: 30, acceptsOffers: true }
    );
    const offer = await apiMakeOffer(request, ben, item.id, 25, 'Would you take 25?');

    await signInThroughUi(page, ada.email, ada.password);
    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-offers').click();
    const inbox = screen(page, 'offers');
    const row = inbox.getByTestId(`offer-row-${offer.id}`);
    await expect(row).toContainText(`From ${ben.displayName}`, { timeout: 30_000 });
    await expect(inbox.getByTestId(`offer-row-turn-${offer.id}`)).toContainText('Your turn');
    await expect(inbox.getByTestId('offers-your-turn')).toContainText(
      '1 offer waits for your answer'
    );
    await row.click();

    const offerScreen = screen(page, 'offer');
    await expect(offerScreen.getByTestId('offer-eyebrow')).toHaveText(
      `Offer from ${ben.displayName}`,
      { timeout: 30_000 }
    );
    await expect(offerScreen.getByTestId('deal-message')).toContainText('Would you take 25?');
    await offerScreen.getByRole('button', { name: 'Counter', exact: true }).click();

    const form = screen(page, 'offer-counter');
    await expect(form.getByTestId('current-proposal')).toContainText('Current proposal: $25.00', {
      timeout: 30_000,
    });
    // The same deal is no answer.
    await form.getByRole('button', { name: 'Send counter-offer' }).click();
    await expect(form.getByTestId('offer-error')).toContainText(
      'A counter-offer must change the amount or the cards.'
    );
    await form.getByLabel('Amount').fill('28');
    await form.getByRole('button', { name: 'Send counter-offer' }).click();
    await expect(snackbar(page)).toContainText('Counter-offer sent.', { timeout: 30_000 });
    await expect(offerScreen.getByTestId('offer-turn')).toHaveText(
      `Waiting for ${ben.displayName}`,
      { timeout: 30_000 }
    );
    const counterId = offerIdOf(page.url());
    expect((await apiOffer(request, ben, counterId)).cashAmount).toBe(28);

    // Ben declines the counter-offer: the closed negotiation shows his reason.
    await apiDeclineOffer(request, ben, counterId, 'Too much for me, sorry.');
    await expect(offerScreen.getByTestId('offer-turn')).toHaveText('This negotiation is closed', {
      timeout: 30_000,
    });
    await expect(offerScreen.getByTestId('offer-status')).toHaveAccessibleName('Status: Declined');
    await expect(offerScreen.getByTestId('offer-history')).toContainText(
      `${ben.displayName} declined`
    );
    await expect(offerScreen.getByTestId('offer-history')).toContainText(
      'Reason: “Too much for me, sorry.”'
    );
  });
});
