import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, expect, test } from './support/fixtures';
import { randomCentre } from './support/places';

/**
 * Acceptance — payment protection with the fake provider (no card, no money): the seller sets up
 * payouts; the buyer makes a cash offer with "Use payment protection"; the seller accepts; the
 * buyer pays on the local fake checkout (the payment provider holds the money); the seller ships
 * with tracking; the buyer confirms receipt and the payout is released to the seller.
 */
test.describe('acceptance: payment protection', () => {
  requireStack();

  test('protected sale: payouts, offer, accept, fake checkout, shipment, receipt, payout', async ({
    api,
    actors,
  }) => {
    test.setTimeout(240_000);
    const {
      collector: seller,
      binder,
      items: [item],
    } = await api.seller(
      'acc-paysell',
      randomCentre('payments'),
      [{ code: 'GLM-EN022', extra: { availability: 'SALE', askingPrice: 40, quantity: 1 } }],
      { displayName: `Pia Seller ${suffix()}` },
    );
    const buyer = await api.collector('acc-paybuy', { displayName: `Bo Buyer ${suffix()}` });
    const card = item.card.name;

    // --- The seller sets up payouts (fake provider: ready at once) -----------------------------
    const pageS = await actors.open(seller);
    await pageS.goto('/settings/payouts');
    await expect(pageS.getByTestId('payout-status')).toContainText('Not set up');
    await pageS.getByRole('button', { name: 'Set up payouts' }).click();
    await expect(pageS.getByTestId('payout-status')).toContainText('Ready for payouts');

    // --- The buyer offers with payment protection ---------------------------------------------
    const pageB = await actors.open(buyer);
    await pageB.goto(`/binders/${binder.id}`);
    await pageB
      .getByRole('article', { name: card })
      .getByRole('button', { name: `Make an offer on ${card}` })
      .click();
    const dialog = await dialogReady(pageB.getByRole('dialog', { name: 'Make an offer' }));
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('40');
    const protection = dialog.getByTestId('protection-option');
    await expect(protection).toContainText('the payment provider holds the money');
    await expect(dialog).not.toContainText(/escrow/i);
    await protection.getByRole('checkbox', { name: 'Use payment protection' }).check();
    await expect(dialog.getByTestId('offer-summary')).toContainText(
      `$40.00 for ${card} with payment protection`,
    );
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog).toBeHidden();
    await pageB.getByRole('button', { name: 'View offer' }).click();
    await expect(pageB).toHaveURL(/\/offers\/[\w-]+$/);
    await expect(pageB.getByTestId('offer-chips')).toContainText('Payment protection');
    const offerPath = new URL(pageB.url()).pathname;

    // --- The seller accepts -------------------------------------------------------------------------
    await pageS.goto(offerPath);
    await pageS
      .getByRole('region', { name: 'Your answer' })
      .getByRole('button', {
        name: 'Accept',
      })
      .click();
    await pageS
      .getByRole('dialog', { name: 'Accept this offer?' })
      .getByRole('button', { name: 'Accept offer' })
      .click();
    await expect(pageS.getByTestId('offer-notice')).toContainText('Offer accepted');
    await pageS.getByRole('link', { name: 'Go to the trade' }).click();
    await expect(pageS).toHaveURL(/\/trades\/[\w-]+$/);
    const tradePath = new URL(pageS.url()).pathname;

    // --- The buyer pays through the local fake checkout ---------------------------------------
    await pageB.goto(tradePath);
    const nextB = pageB.getByTestId('next-action');
    await expect(nextB).toContainText('Your move: pay with payment protection');
    await nextB.getByRole('button', { name: 'Pay $40.00' }).click();
    await expect(pageB).toHaveURL(/\/checkout\/fake\/[\w-]+$/);
    await expect(pageB.getByTestId('local-payment-banner')).toContainText('Local test payment');
    await pageB.getByRole('button', { name: 'Pay $40.00' }).click();
    await expect(pageB).toHaveURL(new RegExp(`${tradePath}\\?payment=secured$`), {
      timeout: 60_000,
    });
    await expect(pageB.getByTestId('payment-card')).toContainText('Payment secured');

    // --- The seller ships with tracking ----------------------------------------------------------
    await pageS.reload();
    const nextS = pageS.getByTestId('next-action');
    await expect(nextS).toContainText('Your move: ship the card');
    await nextS.getByRole('button', { name: 'Mark as shipped' }).click();
    const ship = await dialogReady(pageS.getByRole('dialog', { name: 'Mark as shipped' }));
    await ship.getByRole('textbox', { name: 'Carrier' }).fill('Canada Post');
    const tracking = `E2E-ACC-${suffix().toUpperCase()}`;
    await ship.getByRole('textbox', { name: 'Tracking number' }).fill(tracking);
    await ship.getByRole('button', { name: 'Mark as shipped' }).click();
    await expect(ship).toBeHidden();
    await expect(pageS.getByTestId('shipment-tracking')).toHaveText(tracking);

    // --- The buyer confirms receipt: the payout is released ---------------------------------------
    await pageB.goto(tradePath);
    await expect(nextB).toContainText('Your move: confirm you received the card');
    await nextB.getByRole('button', { name: 'Confirm receipt' }).click();
    await pageB
      .getByRole('dialog', { name: 'Confirm you received the card?' })
      .getByRole('button', { name: 'Confirm receipt' })
      .click();
    await expect(pageB.getByTestId('trade-notice')).toContainText(
      `the payout was released to ${seller.displayName}`,
    );
    await expect(nextB).toContainText('Trade completed');
    await expect(pageB.getByTestId('payment-card')).toContainText('Paid out');

    await pageS.reload();
    await expect(nextS).toContainText('Trade completed');
    await expect(pageS.getByTestId('payment-payout')).toContainText('Payout released to you');
  });
});
