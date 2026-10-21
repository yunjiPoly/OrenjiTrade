import { expect, test } from './support/fixtures';
import {
  SEED_PASSWORD,
  createOnboardedCollector,
  PLACES,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

/**
 * Home, the first tab (stage R7; owner prompt of 2026-10-19, docs/product/specs/2026-10-19-home-
 * full-design.md; mockup v50 screens 10, 10b and 10c), against the real isolated stack and its
 * seed, which dates its posts relative to the API's start (collector5's 12 Yu-Gi-Oh! cards today,
 * collector2's wish and deck core, collector5's "Trade only" deck core this week...). The privacy
 * fixture fails the test on any coordinate or distance in an answer; every place on Home is a
 * state or province.
 */
test.describe('mobile Home', () => {
  requireStack();

  test('shows new cards, a wish with "I have it" and a deck core; a chip reaches the end', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await signInThroughUi(page, 'collector1@orenjitrade.test', SEED_PASSWORD);
    const home = screen(page, 'home');
    await expect(home).toBeVisible({ timeout: 30_000 });
    await expect(home.getByRole('button', { name: 'Region: Americas (North)' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(home.getByRole('button', { name: 'Game: Yu-Gi-Oh!. Change game' })).toBeVisible();

    // New cards: collector5's twelve, a grid with "+9"; a picture opens Who has this card.
    const twelve = home.getByRole('button', {
      name: /^collector5 listed 12 cards, .+, California$/,
    });
    await expect(twelve).toBeVisible({ timeout: 30_000 });
    await expect(
      home.getByRole('button', { name: '9 more cards from this collector' })
    ).toBeVisible();
    // A wish of collector2 with "I have it"; a deck core of collector2.
    await expect(
      home.getByRole('button', { name: /^collector2 wants a card, .+, Ontario$/ })
    ).toBeVisible();
    await expect(
      home.getByRole('button', { name: 'I have Azure-Eyes Sky Dragon. Message collector2' })
    ).toBeVisible();
    await expect(
      home.getByRole('button', { name: /^Moth Queen core, deck core, \$95/ })
    ).toBeVisible();
    await expect(home.getByText('TODAY')).toBeVisible();
    // Nothing sponsored, nothing to buy (ADR 0019); no city anywhere on Home.
    await expect(home.getByText(/Sponsored|Upgrade|Premium/)).toHaveCount(0);
    await expect(home.getByText(/Toronto|Los Angeles|Montréal/)).toHaveCount(0);

    // The Wanted chip: only wishes, down to "You're all caught up" with the chip's text.
    await home.getByRole('button', { name: 'Wanted' }).click();
    await expect(home.getByRole('button', { name: 'Wanted' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(
      home.getByRole('button', { name: /^collector2 wants a card, .+, Ontario$/ })
    ).toBeVisible({ timeout: 30_000 });
    await expect(home.getByRole('button', { name: /listed 12 cards/ })).toHaveCount(0);
    const end = home.getByTestId('home-end-text');
    await end.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(end).toHaveText(
      'That’s every wish for Yu-Gi-Oh! in Americas (North) from the last 30 days.'
    );
    await expect(home.getByText("You're all caught up")).toBeVisible();

    // "Explore the map" opens Search on its map.
    await home.getByRole('button', { name: 'Explore the map' }).click();
    const search = screen(page, 'search');
    await expect(search.getByTestId('map-drawing')).toBeVisible({ timeout: 30_000 });
  });

  test('Get started on a fresh account: "Turn on", the steps, hidden for good', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const suffix = Math.random().toString(36).slice(2, 7);
    const fresh = await createOnboardedCollector(request, 'homegs', `Mobile Day One ${suffix}`, {
      location: PLACES.quebec,
    });
    await signInThroughUi(page, fresh.email, fresh.password);
    const home = screen(page, 'home');
    const card = home.getByTestId('home-get-started');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Do these once to sell and find cards in your region.');
    // A location hidden from the map: "Turn on" opens Settings › Location.
    await expect(home.getByTestId('home-step-province-todo')).toContainText(
      'Turn on Show me on the map'
    );
    await expect(home.getByTestId('home-step-card-todo')).toContainText(
      'Add a card and set it to Public'
    );
    await expect(home.getByTestId('home-step-wish-todo')).toContainText(
      "We'll tell you when someone lists it"
    );
    await expect(home.getByRole('progressbar', { name: 'Get started' })).toBeVisible();
    await home.getByRole('button', { name: 'Turn on' }).click();
    await expect(screen(page, 'settings-location')).toBeVisible({ timeout: 30_000 });
    await page.goBack();

    // Hidden for good on this phone (it stays hidden after a reload).
    await screen(page, 'home').getByRole('button', { name: 'Hide these steps' }).click();
    await expect(screen(page, 'home').getByTestId('home-get-started')).toHaveCount(0);
    await page.reload();
    await expect(screen(page, 'home')).toBeVisible({ timeout: 30_000 });
    await expect(screen(page, 'home').getByTestId('home-search-field')).toBeVisible({
      timeout: 30_000,
    });
    await expect(screen(page, 'home').getByTestId('home-get-started')).toHaveCount(0);
  });
});
