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
  createStaffMember,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Payment protection and disputes (Phase 9) against the real local stack with the fake payment
 * provider (no card, no money), with fresh fictional collectors.
 *
 * 1. A seller sets up payouts in Settings → Payouts; a buyer makes a cash offer with "Use payment
 *    protection"; once accepted, the buyer pays through the local fake checkout, the seller marks
 *    the card as shipped with tracking, the buyer confirms receipt: the trade is completed and the
 *    payout (amount minus the platform fee) is shown to both.
 * 2. A second protected trade (prepared through the API up to the shipment) is disputed from the
 *    trade page with a photo and a message; a stranger gets the not-found state; an admin puts
 *    the dispute on hold, adds an internal note and resolves it for the buyer with a refund; the
 *    buyer sees the decision and the refund, and the audit log lists every admin action.
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
  return { lat: pick(49.6, 0.6), lng: pick(-74.9, 1.8) };
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

/** A 48×48 PNG (fictional photo of the card). */
const CARD_PHOTO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAT0lEQVR42u3WsQ0AIAgEQMZxJmdyZ11ASmPxl1CScNXztee4z2rm8X4BAQHlgT4d7vaBgIACQZIaCAhIH/I6gID0IUkNBASkD3kdQEDJoAMWbGrTipIFrAAAAABJRU5ErkJggg==',
  'base64',
);

async function openSignedIn(browser: Browser, collector: OnboardedCollector): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await stubCardImages(page);
  await signInThroughUi(page, collector.email, collector.password);
  return page;
}

/** A discoverable seller with a published binder holding one card for sale. */
async function sellerWithCard(
  api: APIRequestContext,
  prefix: string,
  name: string,
  askingPrice: number,
): Promise<{ collector: OnboardedCollector; binderId: string; itemId: string; card: string }> {
  const collector = await createOnboardedCollector(api, prefix, {
    area: { ...randomArea(), radiusKm: 5 },
    displayName: name,
  });
  await apiUpdatePrivacy(api, collector.idToken, { discoverable: true });
  const binder = await apiCreateBinder(api, collector.idToken, {
    name: `E2E payments binder ${suffix()}`,
    kind: 'TRADE',
    description: 'Fictional binder for the payment protection E2E suite.',
  });
  await apiPublishBinder(api, collector.idToken, binder.id, 'UNTIL_DISABLED');
  const item = await apiCreateItem(api, collector.idToken, {
    printingId: await printingIdOf(api, collector.idToken, 'AZR-EN011'),
    binderId: binder.id,
    condition: 'NEAR_MINT',
    currency: 'CAD',
    quantity: 1,
    availability: 'SALE',
    askingPrice,
    acceptsOffers: true,
    publicNotes: 'Fictional listing for the payment protection E2E suite.',
  });
  return { collector, binderId: binder.id, itemId: item.id, card: item.card.name };
}

async function post(
  api: APIRequestContext,
  token: string,
  path: string,
  data: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await api.post(`${API_URL}/api/v1${path}`, {
    headers: authHeader(token),
    data,
  });
  expect(response.ok(), `POST ${path} → ${response.status()}`).toBeTruthy();
  const text = await response.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

async function tradeOf(
  api: APIRequestContext,
  token: string,
  tradeId: string,
): Promise<{ status: string; payment?: { sellerAmount: number } | null }> {
  const response = await api.get(`${API_URL}/api/v1/trades/${tradeId}`, {
    headers: authHeader(token),
  });
  expect(response.ok(), 'GET /trades/{id}').toBeTruthy();
  return response.json();
}

/**
 * A protected trade prepared through the API up to the shipment: the seller's payouts, the
 * buyer's protected cash offer, the acceptance, the fake payment (synthetic webhook) and the
 * shipment with tracking.
 */
async function shippedProtectedTrade(
  api: APIRequestContext,
  seller: OnboardedCollector,
  buyer: OnboardedCollector,
  itemId: string,
  amount: number,
): Promise<string> {
  await post(api, seller.idToken, '/me/seller-account/onboarding', {});
  const offer = await post(api, buyer.idToken, '/offers', {
    itemId,
    kind: 'CASH',
    cashAmount: amount,
    currency: 'CAD',
    protectionRequested: true,
    message: 'Protected payment and shipping, please.',
  });
  expect(offer['protectionRequested']).toBe(true);
  const accepted = await post(api, seller.idToken, `/offers/${String(offer['id'])}/accept`, {});
  const tradeId = String(accepted['tradeId']);
  const payment = await post(api, buyer.idToken, `/trades/${tradeId}/pay`);
  const ref = String(payment['checkoutUrl']).split('/').pop();
  await post(api, buyer.idToken, `/payments/fake/${ref}/confirm`, { outcome: 'SUCCEEDED' });
  await expect
    .poll(async () => (await tradeOf(api, buyer.idToken, tradeId)).status, {
      message: 'the synthetic webhook secures the payment',
      timeout: 45_000,
    })
    .toBe('PAID');
  await post(api, seller.idToken, `/trades/${tradeId}/ship`, {
    carrier: 'Canada Post',
    trackingNumber: `E2E-${suffix().toUpperCase()}`,
  });
  return tradeId;
}

test.describe('payment protection and disputes', () => {
  requireStack();

  test('a protected sale is paid through the fake checkout, shipped, received and paid out', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const {
      collector: seller,
      binderId,
      card,
    } = await sellerWithCard(request, 'paysella', `Pia Seller ${suffix()}`, 40);
    const buyer = await createOnboardedCollector(request, 'paybuyb', {
      displayName: `Bo Buyer ${suffix()}`,
    });

    // --- The seller sets up payouts (fake provider: ready at once) --------------------------
    const pageS = await openSignedIn(browser, seller);
    const watchS = watchCoordinates(pageS);
    await pageS.goto('/settings/payouts');
    const status = pageS.getByTestId('payout-status');
    await expect(status).toContainText('Not set up');
    await expect(pageS.getByText('Local test provider').first()).toBeVisible();
    await pageS.getByRole('button', { name: 'Set up payouts' }).click();
    await expect(pageS.getByTestId('payouts-complete')).toContainText('Payouts are set up');
    await expect(status).toContainText('Ready for payouts');
    await expect(pageS.getByRole('button', { name: 'Set up payouts' })).toHaveCount(0);

    // --- The buyer offers with payment protection ------------------------------------------
    const pageB = await openSignedIn(browser, buyer);
    const watchB = watchCoordinates(pageB);
    await pageB.goto(`/binders/${binderId}`);
    await pageB
      .getByRole('article', { name: card })
      .getByRole('button', { name: `Make an offer on ${card}` })
      .click();
    const dialog = pageB.getByRole('dialog', { name: 'Make an offer' });
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('40');
    const option = dialog.getByTestId('protection-option');
    await expect(option).toContainText('the payment provider holds the money');
    await expect(dialog).not.toContainText(/escrow/i);
    await option.getByRole('checkbox', { name: 'Use payment protection' }).check();
    await expect(dialog.getByTestId('offer-summary')).toContainText(
      `$40.00 for ${card} with payment protection`,
    );
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog).toBeHidden();
    // The buyer's offer (the snack bar's "View offer" is covered by offers.spec.ts).
    const sent = await request.get(`${API_URL}/api/v1/offers`, {
      headers: authHeader(buyer.idToken),
      params: { role: 'buyer', limit: 5 },
    });
    expect(sent.ok(), 'GET /offers?role=buyer').toBeTruthy();
    const offers = ((await sent.json()) as { items: { id: string }[] }).items;
    expect(offers).toHaveLength(1);
    const offerId = offers[0].id;
    await pageB.goto(`/offers/${offerId}`);
    await expect(pageB.getByTestId('offer-chips')).toContainText('Payment protection');

    // The seller accepts (the offer UI is covered by offers.spec.ts).
    const accepted = await post(request, seller.idToken, `/offers/${offerId}/accept`, {});
    expect(accepted['protectionRequested']).toBe(true);
    const tradeId = String(accepted['tradeId']);

    // --- The buyer pays through the local fake checkout ------------------------------------
    await pageB.goto(`/trades/${tradeId}`);
    const nextB = pageB.getByTestId('next-action');
    await expect(nextB).toContainText('Your move: pay with payment protection');
    await expect(pageB.getByTestId('step-paid')).toHaveAttribute('data-state', 'current');
    await nextB.getByRole('button', { name: 'Pay $40.00' }).click();
    await expect(pageB).toHaveURL(/\/checkout\/fake\/[\w-]+$/);
    await expect(pageB.getByTestId('local-payment-banner')).toContainText('Local test payment');
    await expect(pageB.getByTestId('checkout-amount')).toHaveText('$40.00');
    await pageB.getByRole('button', { name: 'Pay $40.00' }).click();
    await expect(pageB).toHaveURL(new RegExp(`/trades/${tradeId}\\?payment=secured$`), {
      timeout: 60_000,
    });
    await expect(pageB.getByTestId('trade-notice')).toContainText('Payment secured');
    await expect(nextB).toContainText(`Waiting for ${seller.displayName} to ship`);
    await expect(pageB.getByTestId('payment-card')).toContainText('Payment secured');
    await expect(pageB.getByTestId('step-paid')).toHaveAttribute('data-state', 'done');

    // The seller's share: the amount minus the platform fee of the payment rules (5 % locally).
    const secured = await tradeOf(request, buyer.idToken, tradeId);
    const payout = `$${Number(secured.payment?.sellerAmount).toFixed(2)}`;

    // --- The seller ships with tracking -----------------------------------------------------
    await pageS.goto(`/trades/${tradeId}`);
    const nextS = pageS.getByTestId('next-action');
    await expect(nextS).toContainText('Your move: ship the card');
    await expect(pageS.getByTestId('payment-seller-amount')).toContainText(payout);
    await nextS.getByRole('button', { name: 'Mark as shipped' }).click();
    const ship = pageS.getByRole('dialog', { name: 'Mark as shipped' });
    // The dialog focuses its first field once opened; typing earlier can land in the wrong field.
    await expect(ship.getByRole('textbox', { name: 'Carrier' })).toBeFocused();
    await ship.getByRole('textbox', { name: 'Carrier' }).fill('Canada Post');
    await ship.getByRole('textbox', { name: 'Tracking number' }).fill('E2E-TRACK-0001');
    await ship
      .getByRole('textbox', { name: /^Note to / })
      .fill('Top loader and bubble mailer (fictional).');
    await ship.getByRole('button', { name: 'Mark as shipped' }).click();
    await expect(ship).toBeHidden();
    await expect(pageS.getByTestId('trade-notice')).toContainText('Marked as shipped');
    await expect(pageS.getByTestId('shipment-tracking')).toHaveText('E2E-TRACK-0001');
    await expect(nextS).toContainText(`Waiting for ${buyer.displayName} to confirm receipt`);

    // --- The buyer confirms receipt: the payout is released ---------------------------------
    await pageB.goto(`/trades/${tradeId}`);
    await expect(nextB).toContainText('Your move: confirm you received the card');
    await expect(pageB.getByTestId('shipment-card')).toContainText('Canada Post');
    await nextB.getByRole('button', { name: 'Confirm receipt' }).click();
    await pageB
      .getByRole('dialog', { name: 'Confirm you received the card?' })
      .getByRole('button', { name: 'Confirm receipt' })
      .click();
    await expect(pageB.getByTestId('trade-notice')).toContainText(
      `the payout was released to ${seller.displayName}`,
    );
    await expect(nextB).toContainText('Trade completed');
    await expect(pageB.getByTestId('payment-payout')).toContainText(payout);
    await expect(pageB.getByTestId('payment-card')).toContainText('Paid out');

    await pageS.reload();
    await expect(nextS).toContainText('Trade completed');
    await expect(pageS.getByTestId('payment-payout')).toContainText('Payout released to you');
    await expect(pageS.getByTestId('payment-payout')).toContainText(payout);
    await expect(pageS.getByRole('list', { name: 'Trade timeline' })).toContainText(
      'Payout released to you',
    );

    for (const watch of [watchS, watchB]) {
      await watch.settle();
      expect(tooPrecise(watch.samples), 'lat/lng with more than 3 decimals').toEqual([]);
    }
    await pageS.context().close();
    await pageB.context().close();
  });

  test('a disputed protected trade is resolved for the buyer with a refund and an audit trail', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000);
    const {
      collector: seller,
      itemId,
      card,
    } = await sellerWithCard(request, 'dispsella', `Sol Seller ${suffix()}`, 25);
    const buyer = await createOnboardedCollector(request, 'dispbuyb', {
      displayName: `Dee Buyer ${suffix()}`,
    });
    const stranger = await createOnboardedCollector(request, 'dispstranger', {
      displayName: `Sam Stranger ${suffix()}`,
    });
    const tradeId = await shippedProtectedTrade(request, seller, buyer, itemId, 25);
    const admin = await createStaffMember(request, 'dispadmin', ['ADMIN']);

    try {
      // --- The buyer opens a dispute from the trade page ------------------------------------
      const pageB = await openSignedIn(browser, buyer);
      const watchB = watchCoordinates(pageB);
      await pageB.goto(`/trades/${tradeId}`);
      const nextB = pageB.getByTestId('next-action');
      await expect(nextB).toContainText('Your move: confirm you received the card');
      await nextB.getByRole('button', { name: 'Open a dispute' }).click();
      const open = pageB.getByRole('dialog', { name: 'Open a dispute' });
      await open.getByRole('button', { name: 'Open dispute' }).click();
      await expect(open.getByText('Choose what went wrong.')).toBeVisible();
      await open.getByRole('radio', { name: /^Not as described/ }).check();
      await open
        .getByRole('textbox', { name: 'Describe the problem' })
        .fill('The listing said near mint but the card has a crease across the art.');
      await open.getByRole('button', { name: 'Open dispute' }).click();
      await expect(pageB).toHaveURL(/\/disputes\/[\w-]+\?opened=1$/);
      const disputeId = new URL(pageB.url()).pathname.split('/').pop() as string;
      await expect(pageB.getByTestId('dispute-notice')).toContainText('Dispute opened');
      await expect(pageB.getByTestId('dispute-chips')).toContainText('Open');
      await expect(pageB.getByTestId('dispute-overview')).toContainText('Not as described');
      await expect(pageB.getByRole('list', { name: 'Dispute timeline' })).toContainText(
        'You opened the dispute: Not as described',
      );

      // A photo as evidence (previewed before it is added) and a message.
      await pageB.getByTestId('evidence-file-input').setInputFiles({
        name: 'crease.png',
        mimeType: 'image/png',
        buffer: CARD_PHOTO,
      });
      const preview = pageB.getByTestId('evidence-preview');
      await expect(preview).toContainText('crease.png');
      await expect(preview.getByRole('img', { name: 'Preview of the photo to add' })).toBeVisible();
      await pageB.getByRole('textbox', { name: 'Caption (optional)' }).fill('Crease under a lamp');
      await pageB.getByRole('button', { name: 'Add evidence' }).click();
      await expect(pageB.getByTestId('dispute-notice')).toContainText('Photo added');
      const evidence = pageB.getByTestId('evidence-item');
      await expect(evidence).toHaveCount(1);
      await expect(evidence.first()).toContainText('Crease under a lamp');
      await expect(pageB.getByTestId('evidence-image')).toBeVisible();
      await expect(pageB.getByText('You can add 9 more.')).toBeVisible();
      await pageB
        .getByTestId('dispute-message-input')
        .fill('Could you check your photos from before shipping?');
      await pageB.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(pageB.getByTestId('dispute-message')).toContainText(
        'Could you check your photos from before shipping?',
      );

      // --- A stranger never sees the dispute --------------------------------------------------
      const pageC = await openSignedIn(browser, stranger);
      await pageC.goto(`/disputes/${disputeId}`);
      await expect(
        pageC.getByRole('heading', { name: 'This dispute is not available' }),
      ).toBeVisible();
      const refused = await request.get(`${API_URL}/api/v1/disputes/${disputeId}`, {
        headers: authHeader(stranger.idToken),
      });
      expect(refused.status()).toBe(404);
      await pageC.context().close();

      // --- An admin holds, notes and resolves it for the buyer --------------------------------
      const pageA = await openSignedIn(browser, admin);
      const watchA = watchCoordinates(pageA);
      await pageA.goto('/admin/disputes?status=OPEN');
      await pageA
        .getByRole('link', {
          name: new RegExp(`^Dispute: Not as described, Open, buyer @${buyer.handle}$`),
        })
        .click();
      await expect(pageA).toHaveURL(new RegExp(`/admin/disputes/${disputeId}$`));
      await expect(pageA.getByTestId('dispute-overview')).toContainText(card);
      await expect(pageA.getByRole('region', { name: `Buyer @${buyer.handle}` })).toBeVisible();
      await expect(pageA.getByRole('region', { name: `Seller @${seller.handle}` })).toBeVisible();
      await expect(pageA.getByTestId('evidence-item')).toHaveCount(1);

      await pageA.getByRole('button', { name: 'Put on hold' }).click();
      const hold = pageA.getByRole('dialog', { name: 'Put this dispute on hold?' });
      await hold.getByRole('textbox').fill('Checking the seller photos (E2E).');
      await hold.getByRole('button', { name: 'Put on hold' }).click();
      await expect(
        pageA.getByText('The dispute is on hold. The action is in the audit log.'),
      ).toBeVisible();
      await expect(pageA.getByTestId('dispute-chips')).toContainText('On hold');

      const note = `Crease visible on the buyer photo (E2E ${suffix()}).`;
      await pageA.getByRole('textbox', { name: 'Add a note' }).fill(note);
      await pageA.getByRole('button', { name: 'Add note' }).click();
      await expect(pageA.getByText('Note added. The action is in the audit log.')).toBeVisible();
      await expect(pageA.getByRole('list', { name: 'Moderator notes' })).toContainText(note);

      await pageA.getByRole('button', { name: 'Resolve', exact: true }).click();
      const resolve = pageA.getByRole('dialog', { name: 'Resolve the dispute' });
      await resolve.getByRole('button', { name: 'Review decision' }).click();
      await expect(resolve.getByText('Choose a decision.')).toBeVisible();
      await resolve.getByRole('radio', { name: /^For the buyer: full refund/ }).check();
      await resolve
        .getByRole('textbox', { name: 'Decision note' })
        .fill('The photos show a crease the listing did not mention.');
      await resolve.getByRole('button', { name: 'Review decision' }).click();
      const review = pageA.getByRole('dialog', { name: 'Confirm the decision' });
      await expect(review.getByTestId('resolve-review')).toContainText(
        `Refund $25.00 to @${buyer.handle}`,
      );
      await review.getByRole('button', { name: 'Confirm decision' }).click();
      await expect(
        pageA.getByText(
          'The dispute is resolved and both collectors were notified. The action is in the audit log.',
        ),
      ).toBeVisible();
      await expect(pageA.getByTestId('dispute-chips')).toContainText('Resolved for the buyer');
      await expect(pageA.getByTestId('dispute-decision')).toContainText('$25.00');
      await expect(pageA.getByRole('button', { name: 'Resolve', exact: true })).toHaveCount(0);

      // The payment is refunded in Payments.
      await pageA.getByRole('link', { name: 'Payment', exact: true }).click();
      await expect(pageA.getByTestId('payment-chips')).toContainText('Refunded');
      await expect(pageA.getByTestId('refund-row')).toContainText('$25.00');

      // Every admin action is in the audit log.
      await pageA.goto(`/admin/disputes/${disputeId}`);
      await pageA.getByRole('link', { name: 'Audit log', exact: true }).click();
      await expect(pageA).toHaveURL(new RegExp(`/admin/audit-logs\\?.*targetId=${disputeId}`));
      const entries = pageA.getByRole('table', { name: 'Audit entries' });
      await expect(entries.getByText('dispute.freeze', { exact: true })).toBeVisible();
      await expect(entries.getByText('dispute.note', { exact: true })).toBeVisible();
      await expect(entries.getByText('dispute.resolve', { exact: true })).toBeVisible();
      await expect(entries.getByText('Resolved a dispute')).toBeVisible();
      await expect(entries.getByText(`@${admin.handle}`).first()).toBeVisible();

      // --- The buyer sees the decision and the refund -----------------------------------------
      await pageB.reload();
      await expect(pageB.getByTestId('dispute-decision')).toContainText(
        'Refund to the buyer: $25.00',
      );
      await expect(pageB.getByTestId('dispute-decision')).toContainText(
        'The photos show a crease the listing did not mention.',
      );
      await expect(pageB.getByText('The dispute is decided: the thread is closed.')).toBeVisible();
      await pageB.getByRole('link', { name: 'Back to the trade' }).click();
      await expect(nextB).toContainText('Trade cancelled');
      await expect(pageB.getByTestId('payment-refunded')).toContainText('$25.00');
      await expect(pageB.getByRole('list', { name: 'Trade timeline' })).toContainText(
        'Refund issued to you',
      );

      for (const watch of [watchA, watchB]) {
        await watch.settle();
        expect(tooPrecise(watch.samples), 'lat/lng with more than 3 decimals').toEqual([]);
      }
      await pageA.context().close();
      await pageB.context().close();
    } finally {
      await admin.demote();
    }
  });
});
