import { APIRequestContext, Browser, Page, expect, test } from '@playwright/test';
import {
  apiCreateBinder,
  apiCreateItem,
  apiPublishBinder,
  apiUpdatePrivacy,
  printingIdOf,
  tooPrecise,
  watchCoordinates,
} from './support/inventory';
import {
  API_URL,
  OnboardedCollector,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Offers and trades (Phase 8) against the real local stack, with fresh fictional collectors.
 *
 * 1. B makes a cash offer on A's public binder card through the "Make an offer" dialog (a second
 *    offer on the same card is refused inline with a link to the open one); A gets the
 *    notification and the SYSTEM message with the offer card in the conversation (B also shares
 *    the offer from the message composer, an OFFER_LINK message), counters from the offer page; B accepts from the inbox → trade page;
 *    both mark the in-person meetup and confirm the exchange → COMPLETED: A's copies drop by one,
 *    B rates A from the trade page and A can rate B from B's profile.
 * 2. A refuses mixed offers in Settings → Offers; B's mixed offer is refused inline (422) and B
 *    sends a trade offer with one of their own private cards from the collector page. A's
 *    answer on a proposal that changed meanwhile (another device countered) gets 409 STALE_OFFER
 *    and the page reloads onto the live proposal; B declines the counter-offer with a reason;
 *    B withdraws a cash offer on a sale-only card; a stranger gets the not-found state (404).
 *
 * Every JSON response is checked for ADR 0004: at most 3 decimals for any lat/lng.
 */

interface Point {
  lat: number;
  lng: number;
}

/** A random point of rural Québec (a region no other spec uses, so maps stay uncrowded). */
function randomArea(): Point {
  const pick = (min: number, span: number) => {
    const value = Math.round((min + Math.random() * span) * 1000);
    return (value % 10 === 0 ? value + 3 : value) / 1000;
  };
  return { lat: pick(48.6, 0.8), lng: pick(-71.9, 2.4) };
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function openSignedIn(browser: Browser, collector: OnboardedCollector): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

/** A discoverable seller with a published trade binder. */
async function seller(
  api: APIRequestContext,
  prefix: string,
  name: string,
): Promise<{ collector: OnboardedCollector; binderId: string }> {
  const collector = await createOnboardedCollector(api, prefix, {
    area: { ...randomArea(), radiusKm: 5 },
    displayName: name,
  });
  await apiUpdatePrivacy(api, collector.idToken, { discoverable: true });
  const binder = await apiCreateBinder(api, collector.idToken, {
    name: `E2E offers binder ${suffix()}`,
    kind: 'TRADE',
    description: 'Fictional binder for the offers E2E suite.',
  });
  await apiPublishBinder(api, collector.idToken, binder.id, 'UNTIL_DISABLED');
  return { collector, binderId: binder.id };
}

async function listCard(
  api: APIRequestContext,
  owner: OnboardedCollector,
  binderId: string,
  code: string,
  extra: Record<string, unknown>,
): Promise<{ id: string; card: { name: string } }> {
  return apiCreateItem(api, owner.idToken, {
    printingId: await printingIdOf(api, owner.idToken, code),
    binderId,
    condition: 'NEAR_MINT',
    currency: 'CAD',
    acceptsOffers: true,
    publicNotes: 'Fictional listing for the offers E2E suite.',
    ...extra,
  });
}

async function itemQuantity(
  api: APIRequestContext,
  owner: OnboardedCollector,
  itemId: string,
): Promise<number> {
  const response = await api.get(`${API_URL}/api/v1/inventory/items/${itemId}`, {
    headers: authHeader(owner.idToken),
  });
  expect(response.ok(), 'GET /inventory/items/{id}').toBeTruthy();
  return ((await response.json()) as { quantity: number }).quantity;
}

/** The pair conversation (created by the offer's SYSTEM message; the call is idempotent). */
async function conversationId(
  api: APIRequestContext,
  from: OnboardedCollector,
  to: OnboardedCollector,
): Promise<string> {
  const response = await api.post(`${API_URL}/api/v1/conversations`, {
    headers: authHeader(from.idToken),
    data: { recipientId: to.id },
  });
  expect(response.ok(), 'POST /conversations').toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

/** The offer id of the page's URL. */
function offerIdOf(page: Page): string {
  const match = /\/offers\/([\w-]+)/.exec(page.url());
  expect(match, `offer id in ${page.url()}`).toBeTruthy();
  return match![1];
}

test.describe('offers and trades', () => {
  requireStack();

  test('a cash offer is countered, accepted and completed as an in-person trade that unlocks rating', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const { collector: a, binderId } = await seller(
      request,
      'offersella',
      `Ada Seller ${suffix()}`,
    );
    const b = await createOnboardedCollector(request, 'offerbuyb', {
      displayName: `Ben Buyer ${suffix()}`,
    });
    const item = await listCard(request, a, binderId, 'AZR-EN011', {
      quantity: 2,
      availability: 'TRADE_OR_SALE',
      askingPrice: 45,
    });
    const card = item.card.name;

    // --- B makes a cash offer from the public binder ------------------------------------------
    const pageB = await openSignedIn(browser, b);
    const watchB = watchCoordinates(pageB);
    await pageB.goto(`/binders/${binderId}`);
    const listing = pageB.getByRole('article', { name: card });
    await listing.getByRole('button', { name: `Make an offer on ${card}` }).click();
    const dialog = pageB.getByRole('dialog', { name: 'Make an offer' });
    await expect(dialog).toContainText('Asking $45.00');
    await expect(dialog.getByRole('radio', { name: 'Cash', exact: true })).toBeChecked();
    // The amount is required: the dialog explains it instead of sending.
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog.getByText('Enter the amount you offer.')).toBeVisible();
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('38');
    await dialog.getByRole('textbox', { name: /^Note to / }).fill('Could we meet at the library?');
    await expect(dialog.getByTestId('offer-summary')).toContainText(`$38.00 for ${card}`);
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog).toBeHidden();
    await expect(pageB.getByText(`Offer sent to ${a.displayName}.`)).toBeVisible();

    // One open offer per card: a second one is refused inline with a link to the first.
    await listing.getByRole('button', { name: `Make an offer on ${card}` }).click();
    const again = pageB.getByRole('dialog', { name: 'Make an offer' });
    await again.getByRole('spinbutton', { name: 'Amount' }).fill('30');
    await again.getByRole('button', { name: 'Send offer' }).click();
    await expect(again.getByTestId('offer-error')).toContainText(
      'You already have an open offer on this card',
    );
    await again.getByRole('link', { name: 'View your open offer' }).click();
    await expect(pageB).toHaveURL(/\/offers\/[\w-]+$/);
    const firstOfferId = offerIdOf(pageB);
    await expect(pageB.getByRole('heading', { level: 1, name: card })).toBeVisible();
    await expect(pageB.getByTestId('offer-chips')).toContainText('Open');
    await expect(pageB.getByTestId('deal-cash')).toHaveText('$38.00');
    await expect(pageB.getByRole('region', { name: 'Your answer' })).toContainText(
      `Waiting for ${a.displayName}`,
    );

    // --- A is notified, sees the SYSTEM message and an OFFER_LINK card in the conversation ---
    const notifications = await request.get(`${API_URL}/api/v1/notifications`, {
      headers: authHeader(a.idToken),
      params: { limit: 20 },
    });
    const received = ((await notifications.json()) as { items: { type: string }[] }).items;
    expect(received.map((entry) => entry.type)).toContain('OFFER_RECEIVED');
    // B shares the offer in the conversation from the composer (OFFER_LINK message).
    const conversation = await conversationId(request, b, a);
    await pageB.goto(`/messages/${conversation}`);
    const threadB = pageB.getByRole('region', { name: `Conversation with ${a.displayName}` });
    await threadB.getByRole('button', { name: 'Attach a card, binder, offer or photo' }).click();
    await pageB.getByRole('menuitem', { name: 'Share an offer' }).click();
    await threadB
      .getByRole('list', { name: `Offers with ${a.displayName}` })
      .getByRole('button', { name: new RegExp(`^${escape(card)}`) })
      .click();
    await expect(threadB.getByTestId('composer-attachment')).toContainText('$38.00');
    await threadB.getByRole('textbox', { name: 'Message' }).fill('Here is my offer.');
    await threadB.getByRole('button', { name: 'Send message' }).click();
    await expect(
      threadB
        .getByRole('log', { name: `Messages with ${a.displayName}` })
        .getByRole('link', { name: /^Open the offer: 38\.00 CAD for / }),
    ).toHaveCount(2);

    const pageA = await openSignedIn(browser, a);
    const watchA = watchCoordinates(pageA);
    await pageA.goto(`/messages/${conversation}`);
    const thread = pageA.getByRole('region', { name: `Conversation with ${b.displayName}` });
    const log = thread.getByRole('log', { name: `Messages with ${b.displayName}` });
    await expect(log.getByTestId('system-message').first()).toContainText(b.displayName);
    const offerCards = log.getByRole('link', { name: /^Open the offer: 38\.00 CAD for / });
    await expect(offerCards).toHaveCount(2);
    await offerCards.first().click();
    await expect(pageA).toHaveURL(new RegExp(`/offers/${firstOfferId}$`));

    // --- A counters from the offer page ------------------------------------------------------
    const answerA = pageA.getByRole('region', { name: 'Your answer' });
    await expect(answerA).toContainText('Your turn to answer');
    await expect(pageA.getByTestId('deal-message')).toHaveText('Could we meet at the library?');
    await answerA.getByRole('button', { name: 'Counter' }).click();
    const counter = pageA.getByRole('dialog', { name: 'Counter-offer' });
    await expect(counter.getByTestId('current-proposal')).toContainText('$38.00');
    // The same deal is not a counter-offer.
    await counter.getByRole('button', { name: 'Send counter-offer' }).click();
    await expect(counter.getByTestId('offer-error')).toContainText(
      'A counter-offer must change the amount or the cards.',
    );
    await counter.getByRole('spinbutton', { name: 'Amount' }).fill('42');
    await counter.getByRole('button', { name: 'Send counter-offer' }).click();
    await expect(counter).toBeHidden();
    await expect(pageA.getByTestId('offer-notice')).toContainText('Counter-offer sent');
    await expect(pageA).not.toHaveURL(new RegExp(`/offers/${firstOfferId}$`));
    await expect(pageA.getByTestId('offer-chips')).toContainText('Countered');
    await expect(pageA.getByTestId('deal-cash')).toHaveText('$42.00');
    await expect(pageA.getByRole('list', { name: 'Offer history' })).toContainText(
      'You sent a counter-offer',
    );

    // --- B finds the counter-offer in the inbox and accepts --------------------------------
    await pageB.goto('/offers?tab=sent');
    const row = pageB.getByRole('link', { name: new RegExp(`^Offer on ${escape(card)} to `) });
    await expect(row).toContainText('Your turn');
    await expect(row.getByTestId('offer-row-terms')).toHaveText('$42.00');
    await row.click();
    const answerB = pageB.getByRole('region', { name: 'Your answer' });
    await expect(answerB).toContainText('Your turn to answer');
    await answerB.getByRole('button', { name: 'Accept' }).click();
    const accept = pageB.getByRole('dialog', { name: 'Accept this offer?' });
    await expect(accept).toContainText(`$42.00 with ${a.displayName}`);
    await accept.getByRole('button', { name: 'Accept offer' }).click();
    await expect(pageB.getByTestId('offer-notice')).toContainText('Offer accepted');
    await expect(pageB.getByTestId('offer-chips')).toContainText('Accepted');
    await pageB.getByRole('link', { name: 'Go to the trade' }).click();
    await expect(pageB).toHaveURL(/\/trades\/[\w-]+$/);
    const tradeUrl = new URL(pageB.url()).pathname;

    // --- Both mark the meetup and confirm ----------------------------------------------------
    const nextB = pageB.getByTestId('next-action');
    await expect(nextB).toContainText('Your move: meet and exchange the cards');
    await nextB.getByRole('button', { name: 'We meet in person' }).click();
    await expect(pageB.getByTestId('trade-notice')).toContainText('Marked as an in-person meetup');
    await expect(pageB.getByTestId('step-meetup')).toContainText('You: done');

    await pageA.goto('/trades');
    await pageA.getByRole('link', { name: new RegExp(`^Trade of ${escape(card)} with `) }).click();
    await expect(pageA).toHaveURL(new RegExp(`${tradeUrl}$`));
    const nextA = pageA.getByTestId('next-action');
    await nextA.getByRole('button', { name: 'We meet in person' }).click();
    await expect(pageA.getByTestId('trade-notice')).toContainText('Meetup agreed');
    await expect(pageA.getByTestId('step-meetup')).toContainText(`${b.displayName}: done`);
    await nextA.getByRole('button', { name: 'Confirm the exchange' }).click();
    await pageA
      .getByRole('dialog', { name: 'Confirm the exchange?' })
      .getByRole('button', { name: 'Confirm the exchange' })
      .click();
    await expect(pageA.getByTestId('trade-notice')).toContainText(
      `Waiting for ${b.displayName} to confirm`,
    );

    await pageB.reload();
    await nextB.getByRole('button', { name: 'Confirm the exchange' }).click();
    await pageB
      .getByRole('dialog', { name: 'Confirm the exchange?' })
      .getByRole('button', { name: 'Confirm the exchange' })
      .click();
    await expect(pageB.getByTestId('trade-notice')).toContainText('Trade completed');
    await expect(nextB).toContainText('Trade completed');
    await expect(pageB.getByRole('region', { name: 'Cards you received' })).toContainText(card);
    await expect(pageB.getByRole('list', { name: 'Trade timeline' })).toContainText(
      'Trade completed',
    );
    // The seller's card left their inventory: one copy of two remains.
    expect(await itemQuantity(request, a, item.id)).toBe(1);

    // --- Rating is unlocked for both -------------------------------------------------------
    await nextB.getByRole('button', { name: `Rate ${a.displayName}` }).click();
    const rate = pageB.getByRole('dialog', { name: `Rate ${a.displayName}` });
    await expect(rate).toContainText('Completed trade');
    await rate
      .getByRole('radiogroup', { name: 'Overall' })
      .getByRole('radio', { name: '5 stars, Excellent' })
      .click();
    await rate.getByRole('button', { name: 'Submit rating' }).click();
    await expect(
      pageB.getByText(`Thanks! Your rating of ${a.displayName} is published.`),
    ).toBeVisible();
    await expect(nextB.getByRole('button', { name: `Rate ${a.displayName}` })).toHaveCount(0);

    await pageA.goto(`/collectors/${b.handle}`);
    await expect(
      pageA
        .getByRole('region', { name: 'Ratings & references' })
        .getByRole('button', { name: 'Rate this collector' }),
    ).toBeVisible();

    for (const watch of [watchA, watchB]) {
      await watch.settle();
      expect(tooPrecise(watch.samples), 'lat/lng with more than 3 decimals').toEqual([]);
    }
    await pageA.context().close();
    await pageB.context().close();
  });

  test('mixed offers can be refused, stale answers reload, offers are declined and withdrawn, strangers see nothing', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const { collector: a, binderId } = await seller(
      request,
      'offersellc',
      `Cleo Seller ${suffix()}`,
    );
    const b = await createOnboardedCollector(request, 'offerbuyd', {
      displayName: `Dan Buyer ${suffix()}`,
    });
    const stranger = await createOnboardedCollector(request, 'offerstranger', {
      displayName: `Sam Stranger ${suffix()}`,
    });
    const knight = await listCard(request, a, binderId, 'SHV-EN003', {
      availability: 'TRADE_OR_SALE',
      askingPrice: 30,
    });
    const sentinel = await listCard(request, a, binderId, 'GLM-EN012', {
      availability: 'SALE',
      askingPrice: 20,
    });
    // B's own card stays private: trade offers may use it anyway.
    const druid = await apiCreateItem(request, b.idToken, {
      printingId: await printingIdOf(request, b.idToken, 'KRH-003'),
      condition: 'LIGHTLY_PLAYED',
      availability: 'TRADE',
      quantity: 3,
      currency: 'CAD',
      acceptsOffers: false,
      visibility: 'PRIVATE',
    });
    const knightName = knight.card.name;
    const druidName = druid.card.name;

    // --- A refuses mixed offers in Settings → Offers ---------------------------------------
    const pageA = await openSignedIn(browser, a);
    const watchA = watchCoordinates(pageA);
    await pageA.goto('/settings/offers');
    const mixed = pageA.getByRole('switch', { name: 'Accept mixed offers (cash + cards)' });
    await expect(mixed).toBeChecked();
    await mixed.click();
    await expect(pageA.getByText('Saved')).toBeVisible();
    await expect(mixed).not.toBeChecked();

    // --- B's mixed offer is refused, then a trade offer with B's private card goes through --
    const pageB = await openSignedIn(browser, b);
    const watchB = watchCoordinates(pageB);
    await pageB.goto(`/collectors/${a.handle}`);
    const knightCard = pageB.getByRole('article', { name: knightName });
    await knightCard.getByRole('button', { name: `Make an offer on ${knightName}` }).click();
    const dialog = pageB.getByRole('dialog', { name: 'Make an offer' });
    await dialog.getByRole('radio', { name: 'Cash + cards' }).click();
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('10');
    // Cards are required for a mixed offer.
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog.getByTestId('cards-error')).toHaveText(
      'Pick at least one of your cards to trade.',
    );
    await dialog.getByRole('searchbox', { name: 'Search your inventory' }).fill('Thornwood');
    await dialog.getByRole('button', { name: `Add ${druidName} to the offer` }).click();
    const chosen = dialog.getByRole('list', { name: 'Cards in your offer' });
    await expect(chosen).toContainText(druidName);
    await chosen.getByRole('button', { name: `Increase quantity of ${druidName}` }).click();
    await expect(chosen.getByTestId('quantity')).toHaveText('2');
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog.getByTestId('offer-error')).toContainText(
      'does not accept mixed offers. Try another kind of offer.',
    );
    await dialog.getByRole('radio', { name: 'Trade', exact: true }).click();
    await expect(dialog.getByTestId('offer-summary')).toContainText(`2 cards for ${knightName}`);
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog).toBeHidden();
    await pageB.getByRole('button', { name: 'View offer' }).click();
    await expect(pageB).toHaveURL(/\/offers\/[\w-]+$/);
    const tradeOfferId = offerIdOf(pageB);
    await expect(pageB.getByTestId('deal-cards')).toContainText(druidName);
    await expect(pageB.getByTestId('deal-cards')).toContainText('×2');

    // --- A's answer on a proposal that changed meanwhile: 409 STALE_OFFER → reload -----------
    await pageA.goto(`/offers/${tradeOfferId}`);
    const answerA = pageA.getByRole('region', { name: 'Your answer' });
    await expect(answerA).toContainText('Your turn to answer');
    // "Another device": A counters through the API with cash + B's card.
    const countered = await request.post(`${API_URL}/api/v1/offers/${tradeOfferId}/counter`, {
      headers: authHeader(a.idToken),
      data: {
        kind: 'MIXED',
        cashAmount: 5,
        currency: 'CAD',
        tradeItemIds: [{ inventoryItemId: druid.id, quantity: 2 }],
        version: 0,
      },
    });
    expect(countered.ok(), 'counter-offer from another device').toBeTruthy();
    const counterId = ((await countered.json()) as { id: string }).id;
    await answerA.getByRole('button', { name: 'Decline' }).click();
    await pageA
      .getByRole('dialog', { name: 'Decline this offer?' })
      .getByRole('button', { name: 'Decline offer' })
      .click();
    await expect(pageA.getByTestId('offer-notice')).toContainText(
      'This offer changed while you were looking at it',
    );
    await expect(pageA).toHaveURL(new RegExp(`/offers/${counterId}$`));
    await expect(pageA.getByTestId('offer-chips')).toContainText('Countered');
    await expect(pageA.getByTestId('deal-cash')).toHaveText('$5.00');
    await expect(pageA.getByRole('region', { name: 'Your answer' })).toContainText(
      `Waiting for ${b.displayName}`,
    );

    // --- B declines the counter-offer with a reason -------------------------------------------
    await pageB.goto(`/offers/${counterId}`);
    const answerB = pageB.getByRole('region', { name: 'Your answer' });
    await expect(answerB).toContainText('Your turn to answer');
    await answerB.getByRole('button', { name: 'Decline' }).click();
    const decline = pageB.getByRole('dialog', { name: 'Decline this offer?' });
    await decline.getByRole('textbox', { name: 'Reason (optional)' }).fill('I keep my cards.');
    await decline.getByRole('button', { name: 'Decline offer' }).click();
    await expect(pageB.getByTestId('offer-notice')).toContainText('Offer declined');
    await expect(pageB.getByTestId('offer-chips')).toContainText('Declined');
    const history = pageB.getByRole('list', { name: 'Offer history' });
    await expect(history).toContainText('You declined');
    await expect(history).toContainText('I keep my cards.');
    await expect(pageB.getByRole('region', { name: 'Your answer' })).toContainText(
      'This negotiation is closed',
    );

    // --- B withdraws a cash offer on a sale-only card ------------------------------------------
    await pageB.goto(`/binders/${binderId}`);
    const sentinelName = sentinel.card.name;
    await pageB
      .getByRole('article', { name: sentinelName })
      .getByRole('button', { name: `Make an offer on ${sentinelName}` })
      .click();
    const cash = pageB.getByRole('dialog', { name: 'Make an offer' });
    await expect(cash).toContainText('this card is for sale');
    await expect(cash.getByRole('radio')).toHaveCount(0);
    await cash.getByRole('spinbutton', { name: 'Amount' }).fill('18.5');
    await cash.getByRole('button', { name: 'Send offer' }).click();
    await expect(cash).toBeHidden();
    await pageB.getByRole('button', { name: 'View offer' }).click();
    await expect(pageB.getByTestId('deal-cash')).toHaveText('$18.50');
    const cashOfferId = offerIdOf(pageB);
    const answerCash = pageB.getByRole('region', { name: 'Your answer' });
    await answerCash.getByRole('button', { name: 'Withdraw offer' }).click();
    await pageB
      .getByRole('dialog', { name: 'Withdraw your offer?' })
      .getByRole('button', { name: 'Withdraw offer' })
      .click();
    await expect(pageB.getByTestId('offer-notice')).toContainText('Offer withdrawn');
    await expect(pageB.getByTestId('offer-chips')).toContainText('Withdrawn');

    // The inbox filters: nothing is active any more on B's side.
    await pageB.goto('/offers?tab=sent&status=active');
    await expect(pageB.getByRole('heading', { name: 'No offers with this status' })).toBeVisible();
    await pageB.getByRole('radio', { name: 'Closed' }).click();
    await expect(pageB.getByTestId('offer-row')).toHaveCount(2);

    // --- A stranger never sees the negotiation ----------------------------------------------
    const pageC = await openSignedIn(browser, stranger);
    await pageC.goto(`/offers/${cashOfferId}`);
    await expect(pageC.getByRole('heading', { name: 'This offer is not available' })).toBeVisible();
    const refused = await request.get(`${API_URL}/api/v1/offers/${counterId}`, {
      headers: authHeader(stranger.idToken),
    });
    expect(refused.status()).toBe(404);

    for (const watch of [watchA, watchB]) {
      await watch.settle();
      expect(tooPrecise(watch.samples), 'lat/lng with more than 3 decimals').toEqual([]);
    }
    await pageA.context().close();
    await pageB.context().close();
    await pageC.context().close();
  });
});
