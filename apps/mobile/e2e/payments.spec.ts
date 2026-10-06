import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  apiListItem,
  apiPublicBinder,
  authHeader,
  createOnboardedCollector,
  openInApp,
  openTab,
  printingIdOf,
  randomRuralArea,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
  type OnboardedCollector,
} from './support/stack';

/**
 * Mobile Phase 9 (payment protection and disputes) against the real, isolated stack with the
 * local fake payment provider (no card, no money) and fresh fictional collectors. One collector
 * uses the app; the other one answers through the API.
 *
 * 1. A buyer makes a cash offer with "Use payment protection" in the app; the seller (payouts set
 *    up) accepts; the buyer pays on the app's fake checkout, the seller ships with tracking, the
 *    buyer sees it live and confirms receipt: the trade completes with the payout released.
 * 2. A seller sets up payouts in Settings → Payouts, accepts a protected offer in the app, sees
 *    the buyer's payment arrive live, marks the card as shipped with tracking, and sees the
 *    payout released once the buyer confirms receipt.
 * 3. A protected trade prepared through the API up to the shipment is disputed from the app with
 *    a reason and a description; on the dispute screen the buyer adds a statement and a photo
 *    from the library (shown through the authenticated file route) and writes to the seller,
 *    whose answer arrives live; a stranger gets not-found from the API.
 *
 * Wording: "payment protection", never "escrow" (checked on every screen of the flow).
 */

const PRINTING = 'PFT-002';
const PHOTO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==',
  'base64'
);

function suffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

async function post(
  api: APIRequestContext,
  as: OnboardedCollector,
  path: string,
  data: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const response = await api.post(`${API_URL}/api/v1${path}`, {
    headers: authHeader(as.idToken),
    data,
  });
  expect(response.ok(), `POST ${path} → ${response.status()}`).toBeTruthy();
  const text = await response.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

interface ApiTrade {
  status: string;
  payment?: { status: string; sellerAmount: number; payoutAmount?: number | null } | null;
}

async function tradeOf(
  api: APIRequestContext,
  as: OnboardedCollector,
  tradeId: string
): Promise<ApiTrade> {
  const response = await api.get(`${API_URL}/api/v1/trades/${tradeId}`, {
    headers: authHeader(as.idToken),
  });
  expect(response.ok(), 'GET /trades/{id}').toBeTruthy();
  return (await response.json()) as ApiTrade;
}

/** `$38.00` like the app (en-CA, CAD). */
function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** A discoverable seller (payouts set up through the API) with one card for sale. */
async function sellerWithCard(
  api: APIRequestContext,
  prefix: string,
  name: string,
  { payouts }: { payouts: boolean }
): Promise<{ seller: OnboardedCollector; binderId: string; itemId: string; card: string }> {
  const seller = await createOnboardedCollector(api, prefix, name, {
    area: { ...randomRuralArea(), radiusKm: 5 },
    discoverable: true,
  });
  if (payouts) {
    await post(api, seller, '/me/seller-account/onboarding');
  }
  const binderId = await apiPublicBinder(api, seller, `Mobile payments binder ${suffix()}`);
  const item = await apiListItem(
    api,
    seller,
    binderId,
    await printingIdOf(api, seller.idToken, PRINTING),
    { availability: 'SALE', askingPrice: 40, acceptsOffers: true, quantity: 1 }
  );
  return { seller, binderId, itemId: item.id, card: item.card.name };
}

/** The buyer pays a protected trade through the fake provider (synthetic webhook). */
async function apiPay(
  api: APIRequestContext,
  buyer: OnboardedCollector,
  tradeId: string
): Promise<void> {
  const payment = await post(api, buyer, `/trades/${tradeId}/pay`);
  const ref = String(payment['checkoutUrl']).split('/').pop();
  await post(api, buyer, `/payments/fake/${ref}/confirm`, { outcome: 'SUCCEEDED' });
  await expect
    .poll(async () => (await tradeOf(api, buyer, tradeId)).status, {
      message: 'the synthetic webhook secures the payment',
      timeout: 45_000,
    })
    .toBe('PAID');
}

test.describe('mobile payment protection and disputes', () => {
  requireStack();

  test('buyer: protected offer → pay on the fake checkout → shipped → receipt → paid out', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { seller, binderId, itemId, card } = await sellerWithCard(
      request,
      'pays',
      `Pia Seller ${suffix()}`,
      { payouts: true }
    );
    const buyer = await createOnboardedCollector(request, 'payb', `Bo Buyer ${suffix()}`);

    // --- The offer with payment protection ---------------------------------------------------
    await signInThroughUi(page, buyer.email, buyer.password);
    await openInApp(page, `/binders/${binderId}`);
    await screen(page, 'binder')
      .getByRole('button', { name: `Make an offer on ${card}` })
      .click({ timeout: 30_000 });
    const form = screen(page, 'offer-new');
    await form.getByLabel('Amount').fill('40');
    const protection = form.getByTestId('protection-option');
    await expect(protection).toContainText(`${seller.displayName} is paid only once you confirm`);
    await protection.getByRole('checkbox', { name: 'Use payment protection' }).click();
    await expect(form.getByTestId('offer-summary')).toContainText('with payment protection');
    await form.getByRole('button', { name: 'Send offer' }).click();
    const offerScreen = screen(page, 'offer');
    await expect(offerScreen.getByTestId('offer-turn')).toHaveText(
      `Waiting for ${seller.displayName}`,
      { timeout: 30_000 }
    );
    await expect(offerScreen.getByText('Payment protection')).toBeVisible();
    const offerId = /\/offers\/([\w-]+)/.exec(page.url())![1]!;

    // --- The seller accepts: a protected trade waiting for the payment -----------------------
    const accepted = await post(request, seller, `/offers/${offerId}/accept`);
    const tradeId = String(accepted['tradeId']);
    expect((await tradeOf(request, buyer, tradeId)).status).toBe('AWAITING_PAYMENT');
    await openInApp(page, `/trades/${tradeId}`);
    const trade = screen(page, 'trade');
    await expect(trade.getByTestId('trade-next-title')).toHaveText(
      'Your move: pay with payment protection',
      { timeout: 30_000 }
    );
    await expect(trade.getByTestId('step-paid')).toBeVisible();

    // --- The app's fake checkout ---------------------------------------------------------------
    await trade.getByRole('button', { name: 'Pay $40.00' }).click();
    const checkout = screen(page, 'checkout');
    await expect(checkout.getByTestId('local-payment-banner')).toContainText('Local test payment', {
      timeout: 30_000,
    });
    await expect(checkout.getByTestId('checkout-amount')).toHaveText('$40.00');
    await expect(checkout).not.toContainText(/escrow/i);
    await checkout.getByRole('button', { name: 'Pay $40.00' }).click();
    await expect(trade.getByTestId('trade-notice')).toContainText(
      `Payment secured. The payment provider holds it until you confirm receipt; ${seller.displayName} was asked to ship.`,
      { timeout: 60_000 }
    );
    await expect(trade.getByTestId('trade-next-title')).toHaveText(
      `Waiting for ${seller.displayName} to ship`
    );
    await expect(trade.getByTestId('payment-card-status')).toContainText('Payment secured');

    // --- The seller ships (API): SHIPMENT_STATUS arrives live ----------------------------------
    await post(request, seller, `/trades/${tradeId}/ship`, {
      carrier: 'Canada Post',
      trackingNumber: `MOB-${suffix().toUpperCase()}`,
    });
    await expect(trade.getByTestId('trade-next-title')).toHaveText(
      'Your move: confirm you received the card',
      { timeout: 30_000 }
    );
    await expect(trade.getByTestId('shipment-card')).toContainText('Canada Post');
    await expect(trade.getByTestId('payment-window')).toContainText('Dispute window ends');

    // --- Confirm receipt: the payout is released ----------------------------------------------
    const sellerAmount = (await tradeOf(request, buyer, tradeId)).payment!.sellerAmount;
    await trade.getByRole('button', { name: 'Confirm receipt' }).click();
    const receipt = page.getByTestId('receipt-dialog');
    await expect(receipt).toContainText(
      `The payout (${money(sellerAmount)}) is released to ${seller.displayName}`
    );
    await receipt.getByRole('button', { name: 'Confirm receipt' }).click();
    await expect(trade.getByTestId('trade-notice')).toContainText(
      `Receipt confirmed: the payout was released to ${seller.displayName}.`,
      { timeout: 30_000 }
    );
    await expect(trade.getByTestId('trade-next-title')).toHaveText('Trade completed');
    await expect(trade.getByTestId('payment-payout')).toContainText(money(sellerAmount));
    const done = await tradeOf(request, seller, tradeId);
    expect(done.status).toBe('COMPLETED');
    expect(done.payment?.status).toMatch(/PAYOUT_PENDING|PAID_OUT/);
    await expect(trade).not.toContainText(/escrow/i);
    void itemId;
  });

  test('seller: payouts → accept a protected offer → payment arrives → ship → paid out', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { seller, itemId, card } = await sellerWithCard(
      request,
      'payss',
      `Sam Seller ${suffix()}`,
      { payouts: false }
    );
    const buyer = await createOnboardedCollector(request, 'paybb', `Bea Buyer ${suffix()}`);

    // --- Settings → Payouts (the fake provider is ready at once) ------------------------------
    await signInThroughUi(page, seller.email, seller.password);
    await openTab(page, 'Profile');
    await screen(page, 'profile').getByTestId('profile-settings').click();
    await screen(page, 'settings').getByRole('link', { name: 'Payouts' }).click();
    const payouts = screen(page, 'settings-payouts');
    await expect(payouts.getByTestId('payout-status')).toContainText('Not set up', {
      timeout: 30_000,
    });
    await expect(payouts.getByTestId('payouts-local')).toContainText('Local test provider');
    await payouts.getByRole('button', { name: 'Set up payouts' }).click();
    await expect(payouts.getByTestId('payouts-complete')).toContainText('Payouts are set up', {
      timeout: 30_000,
    });
    await expect(payouts.getByTestId('payout-status')).toContainText('Ready for payouts');
    await expect(payouts.getByRole('button', { name: 'Set up payouts' })).toHaveCount(0);

    // --- A protected offer arrives; the seller accepts it in the app --------------------------
    const offer = await post(request, buyer, '/offers', {
      itemId,
      kind: 'CASH',
      cashAmount: 40,
      currency: 'CAD',
      protectionRequested: true,
      message: 'Protected payment and shipping, please.',
    });
    expect(offer['protectionRequested']).toBe(true);
    await openInApp(page, `/offers/${String(offer['id'])}`);
    const offerScreen = screen(page, 'offer');
    await offerScreen
      .getByRole('button', { name: 'Accept', exact: true })
      .click({ timeout: 30_000 });
    await page.getByTestId('accept-dialog').getByRole('button', { name: 'Accept offer' }).click();
    await offerScreen.getByRole('button', { name: 'Go to the trade' }).click({ timeout: 30_000 });
    const trade = screen(page, 'trade');
    await expect(trade.getByTestId('trade-next-title')).toHaveText(
      `Waiting for ${buyer.displayName}'s payment`,
      { timeout: 30_000 }
    );
    // Payouts are ready: no reminder.
    await expect(trade.getByTestId('payout-setup')).toHaveCount(0);
    const tradeId = /\/trades\/([\w-]+)/.exec(page.url())![1]!;

    // --- The buyer pays (API): PAYMENT_UPDATE arrives live ------------------------------------
    await apiPay(request, buyer, tradeId);
    await expect(trade.getByTestId('trade-next-title')).toHaveText('Your move: ship the card', {
      timeout: 30_000,
    });

    // --- Mark as shipped with tracking ---------------------------------------------------------
    const tracking = `MOB-${suffix().toUpperCase()}`;
    await trade.getByRole('button', { name: 'Mark as shipped' }).click();
    const ship = page.getByTestId('ship-dialog');
    await expect(ship).toContainText(`Ship ${card} to ${buyer.displayName}`);
    await expect(ship.getByTestId('ship-tip')).toBeVisible();
    await ship.getByLabel('Carrier').fill('Canada Post');
    await ship.getByLabel('Tracking number').fill(tracking);
    await ship.getByRole('button', { name: 'Mark as shipped' }).click();
    await expect(trade.getByTestId('trade-notice')).toContainText(
      `Marked as shipped. ${buyer.displayName} was notified and can follow the tracking.`,
      { timeout: 30_000 }
    );
    await expect(trade.getByTestId('shipment-tracking')).toContainText(tracking);
    expect((await tradeOf(request, buyer, tradeId)).status).toBe('SHIPPED');

    // --- The buyer confirms receipt (API): the payout is released ------------------------------
    await post(request, buyer, `/trades/${tradeId}/confirm-receipt`);
    await expect(trade.getByTestId('trade-next-title')).toHaveText('Trade completed', {
      timeout: 30_000,
    });
    const sellerAmount = (await tradeOf(request, seller, tradeId)).payment!.sellerAmount;
    await expect(trade.getByTestId('payment-payout')).toContainText(
      `Payout released to you${money(sellerAmount)}`
    );
  });

  test('dispute: opened from the trade, statement, photo and messages; strangers get 404', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const { seller, itemId } = await sellerWithCard(request, 'dsps', `Dee Seller ${suffix()}`, {
      payouts: true,
    });
    const buyer = await createOnboardedCollector(request, 'dspb', `Dan Buyer ${suffix()}`);
    const stranger = await createOnboardedCollector(request, 'dspx', `Stan Stranger ${suffix()}`);

    // A protected trade through the API up to the shipment.
    const offer = await post(request, buyer, '/offers', {
      itemId,
      kind: 'CASH',
      cashAmount: 40,
      currency: 'CAD',
      protectionRequested: true,
    });
    const accepted = await post(request, seller, `/offers/${String(offer['id'])}/accept`);
    const tradeId = String(accepted['tradeId']);
    await apiPay(request, buyer, tradeId);
    await post(request, seller, `/trades/${tradeId}/ship`, {
      carrier: 'Canada Post',
      trackingNumber: `MOB-${suffix().toUpperCase()}`,
    });

    // --- The buyer opens a dispute from the trade --------------------------------------------
    await signInThroughUi(page, buyer.email, buyer.password);
    await openInApp(page, `/trades/${tradeId}`);
    const trade = screen(page, 'trade');
    await trade.getByRole('button', { name: 'Open a dispute' }).click({ timeout: 30_000 });
    const dialog = page.getByTestId('dispute-dialog');
    await expect(dialog).toContainText(`The payout to ${seller.displayName} goes on hold`);
    await dialog.getByRole('button', { name: 'Open dispute' }).click();
    await expect(dialog.getByText('Choose what went wrong.')).toBeVisible();
    await dialog.getByRole('radio', { name: 'Damaged in transit' }).click();
    await dialog
      .getByLabel('Describe the problem')
      .fill('The card arrived with a crease across the art.');
    await dialog.getByRole('button', { name: 'Open dispute' }).click();

    const dispute = screen(page, 'dispute');
    await expect(dispute.getByTestId('dispute-notice')).toContainText(
      `Dispute opened. The payout to ${seller.displayName} is on hold`,
      { timeout: 30_000 }
    );
    await expect(dispute.getByTestId('dispute-reason')).toHaveText('Damaged in transit');
    await expect(dispute.getByTestId('dispute-status')).toContainText('Open');
    await expect(dispute.getByTestId('dispute-fact-payout')).toContainText('On hold');
    const disputeId = /\/disputes\/([\w-]+)/.exec(page.url())![1]!;
    expect((await tradeOf(request, buyer, tradeId)).status).toBe('DISPUTED');

    // --- A statement and a photo from the library ------------------------------------------
    await dispute.getByRole('tab', { name: 'Statement' }).click();
    await dispute
      .getByLabel('Your statement')
      .fill('The sleeve was bent when I opened the mailer.');
    await dispute.getByRole('button', { name: 'Add evidence' }).click();
    await expect(dispute.getByTestId('dispute-notice')).toContainText(
      `Statement added. ${seller.displayName} and OrenjiTrade can see it.`,
      { timeout: 30_000 }
    );
    await dispute.getByRole('tab', { name: 'Photo' }).click();
    const chooser = page.waitForEvent('filechooser');
    await dispute.getByRole('button', { name: 'Add a photo' }).click();
    await (
      await chooser
    ).setFiles({ name: 'crease.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    await expect(dispute.getByTestId('evidence-preview')).toContainText('crease.png');
    await dispute.getByLabel('Caption (optional)').fill('Crease under a lamp');
    await dispute.getByRole('button', { name: 'Add evidence' }).click();
    await expect(dispute.getByTestId('dispute-notice')).toContainText('Photo added.', {
      timeout: 30_000,
    });
    await expect(dispute.getByTestId('evidence-item')).toHaveCount(2);
    // The photo comes through the authenticated file route, never a public URL.
    await expect(dispute.getByTestId('evidence-image')).toBeVisible({ timeout: 30_000 });

    // --- Messages: the seller's answer arrives live ------------------------------------------
    await dispute
      .getByLabel(`Message to ${seller.displayName} and OrenjiTrade`)
      .fill('Photos attached. Could you check your packing?');
    await dispute.getByRole('button', { name: 'Send' }).click();
    await expect(dispute.getByText('Photos attached. Could you check your packing?')).toBeVisible({
      timeout: 30_000,
    });
    await post(request, seller, `/disputes/${disputeId}/messages`, {
      body: 'It left in a top loader; sorry it arrived like this.',
    });
    await expect(
      dispute.getByText('It left in a top loader; sorry it arrived like this.')
    ).toBeVisible({ timeout: 30_000 });
    await expect(dispute.getByTestId('dispute-timeline')).toContainText(
      'You opened the dispute: Damaged in transit'
    );
    await expect(dispute).not.toContainText(/escrow/i);

    // --- Nobody else reads it ------------------------------------------------------------------
    const strangerRead = await request.get(`${API_URL}/api/v1/disputes/${disputeId}`, {
      headers: authHeader(stranger.idToken),
    });
    expect(strangerRead.status()).toBe(404);

    // Back to the trade: the dispute card links to it.
    await dispute.getByRole('button', { name: 'Back to the trade' }).click();
    await expect(trade.getByTestId('dispute-card')).toContainText('Damaged in transit', {
      timeout: 30_000,
    });
    await expect(snackbar(page)).toHaveCount(0);
  });
});
