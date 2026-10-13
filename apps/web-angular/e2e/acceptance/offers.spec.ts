import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, escapeRegExp, expect, test } from './support/fixtures';
import { placeOf } from './support/places';

/**
 * Acceptance — offers (spec § 50), two collectors in two browsers:
 * create (B offers cash on A's public card), counter (A answers with a higher amount), accept
 * (B accepts the counter-offer from the inbox, which opens the trade), decline (B's offer on a
 * second card is declined by A with a reason, and B sees the outcome).
 */

test.describe('acceptance: offers', () => {
  requireStack();

  test('create, counter, accept, decline', async ({ api, actors }) => {
    test.setTimeout(210_000);
    const {
      collector: a,
      binder,
      items: [fiend, veil],
    } = await api.seller(
      'acc-offera',
      placeOf('offers'),
      [
        { code: 'AZR-EN021', extra: { availability: 'TRADE_OR_SALE', askingPrice: 30 } },
        { code: 'SHV-EN033', extra: { availability: 'SALE', askingPrice: 20 } },
      ],
      { displayName: `Ada Seller ${suffix()}` },
    );
    const b = await api.collector('acc-offerb', { displayName: `Ben Buyer ${suffix()}` });
    const fiendName = fiend.card.name;
    const veilName = veil.card.name;

    // --- Create: B offers $25 on A's card from the public binder ------------------------------
    const pageB = await actors.open(b);
    await pageB.goto(`/binders/${binder.id}`);
    await pageB
      .getByRole('article', { name: fiendName })
      .getByRole('button', { name: `Make an offer on ${fiendName}` })
      .click();
    const dialog = await dialogReady(pageB.getByRole('dialog', { name: 'Make an offer' }));
    await expect(dialog).toContainText('Asking $30.00');
    await dialog.getByRole('spinbutton', { name: 'Amount' }).fill('25');
    await dialog.getByRole('textbox', { name: /^Note to / }).fill('Could we meet downtown?');
    await expect(dialog.getByTestId('offer-summary')).toContainText(`$25.00 for ${fiendName}`);
    await dialog.getByRole('button', { name: 'Send offer' }).click();
    await expect(dialog).toBeHidden();
    await expect(pageB.getByText(`Offer sent to ${a.displayName}.`)).toBeVisible();

    // --- Counter: A finds it in the inbox and asks for $28 --------------------------------------
    const pageA = await actors.open(a);
    await pageA.goto('/offers');
    await pageA
      .getByRole('link', { name: new RegExp(`^Offer on ${escapeRegExp(fiendName)}`) })
      .click();
    await expect(pageA).toHaveURL(/\/offers\/[\w-]+$/);
    await expect(pageA.getByTestId('deal-cash')).toHaveText('$25.00');
    const answerA = pageA.getByRole('region', { name: 'Your answer' });
    await expect(answerA).toContainText('Your turn to answer');
    await answerA.getByRole('button', { name: 'Counter' }).click();
    const counter = await dialogReady(pageA.getByRole('dialog', { name: 'Counter-offer' }));
    await counter.getByRole('spinbutton', { name: 'Amount' }).fill('28');
    await counter.getByRole('button', { name: 'Send counter-offer' }).click();
    await expect(counter).toBeHidden();
    await expect(pageA.getByTestId('offer-notice')).toContainText('Counter-offer sent');
    await expect(pageA.getByTestId('offer-chips')).toContainText('Countered');
    await expect(pageA.getByTestId('deal-cash')).toHaveText('$28.00');

    // --- Accept: B accepts the counter-offer from the inbox → trade --------------------------
    await pageB.goto('/offers?tab=sent');
    const row = pageB.getByRole('link', {
      name: new RegExp(`^Offer on ${escapeRegExp(fiendName)} to `),
    });
    await expect(row).toContainText('Your turn');
    await expect(row.getByTestId('offer-row-terms')).toHaveText('$28.00');
    await row.click();
    const answerB = pageB.getByRole('region', { name: 'Your answer' });
    await answerB.getByRole('button', { name: 'Accept' }).click();
    const accept = pageB.getByRole('dialog', { name: 'Accept this offer?' });
    await expect(accept).toContainText(`$28.00 with ${a.displayName}`);
    await accept.getByRole('button', { name: 'Accept offer' }).click();
    await expect(pageB.getByTestId('offer-notice')).toContainText('Offer accepted');
    await expect(pageB.getByTestId('offer-chips')).toContainText('Accepted');
    await pageB.getByRole('link', { name: 'Go to the trade' }).click();
    await expect(pageB).toHaveURL(/\/trades\/[\w-]+$/);
    await expect(pageB.getByTestId('next-action')).toContainText(
      'Your move: meet and exchange the cards',
    );

    // --- Decline: B offers on the second card, A declines with a reason -------------------------
    await pageB.goto(`/binders/${binder.id}`);
    await pageB
      .getByRole('article', { name: veilName })
      .getByRole('button', { name: `Make an offer on ${veilName}` })
      .click();
    const second = await dialogReady(pageB.getByRole('dialog', { name: 'Make an offer' }));
    await second.getByRole('spinbutton', { name: 'Amount' }).fill('12');
    await second.getByRole('button', { name: 'Send offer' }).click();
    await expect(second).toBeHidden();
    await pageB.getByRole('button', { name: 'View offer' }).click();
    await expect(pageB).toHaveURL(/\/offers\/[\w-]+$/);
    const declinedOfferUrl = new URL(pageB.url()).pathname;

    await pageA.goto(declinedOfferUrl);
    await expect(pageA.getByTestId('deal-cash')).toHaveText('$12.00');
    await pageA
      .getByRole('region', { name: 'Your answer' })
      .getByRole('button', {
        name: 'Decline',
      })
      .click();
    const decline = await dialogReady(pageA.getByRole('dialog', { name: 'Decline this offer?' }));
    await decline.getByRole('textbox', { name: 'Reason (optional)' }).fill('Too low for me.');
    await decline.getByRole('button', { name: 'Decline offer' }).click();
    await expect(pageA.getByTestId('offer-notice')).toContainText('Offer declined');
    await expect(pageA.getByTestId('offer-chips')).toContainText('Declined');

    await pageB.reload();
    await expect(pageB.getByTestId('offer-chips')).toContainText('Declined');
    await expect(pageB.getByRole('list', { name: 'Offer history' })).toContainText(
      'Too low for me.',
    );
    await expect(pageB.getByRole('region', { name: 'Your answer' })).toContainText(
      'This negotiation is closed',
    );
    const types = (await api.notifications(b)).map((notification) => notification.type);
    expect(types).toEqual(expect.arrayContaining(['OFFER_COUNTERED', 'OFFER_DECLINED']));
  });
});
