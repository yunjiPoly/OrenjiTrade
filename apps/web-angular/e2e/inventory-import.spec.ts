import { Page, expect, test } from '@playwright/test';
import { coordinateLeaks, watchCoordinates } from './support/inventory';
import {
  API_URL,
  authHeader,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Import (web redesign stage WB, spec 9.11, boards W16 and W17) against the real local stack: a
 * fictional deck file (.ydk) and a fictional Collectr CSV export go from the upload to the
 * inventory through every state. The deck names the three fictional passcodes of the E2E database
 * (SEED_IMPORT_FIXTURES: 910000001 "Fixture Lantern Wisp", 910000002 "Fixture Clockwork Heron"
 * with two printings, 910000003 its alternate artwork) and one unknown passcode; the CSV names
 * cards of the sample catalog. No card provider, no Collectr. The limits on screen are the
 * server's (`GET /inventory/imports/limits`).
 */

const DECK = [
  '#created by a fictional player',
  '#main',
  '910000001',
  '910000001',
  '910000002',
  '#extra',
  '910000003',
  '!side',
  '910000002',
  '919999999',
  '',
].join('\r\n');

const EXPORT = [
  'Portfolio Name,Category,Set,Product Name,Card Number,Rarity,Variance,Grade,Card Condition,Average Cost Paid,Quantity,Market Price (As of 2026-10-01),Price Override,Watchlist,Date Added,Notes',
  'Main,Yu-Gi-Oh!,Azure Dawn,Azure-Eyes Sky Dragon,AZR-EN001,Ultra Rare,1st Edition,Ungraded,Near Mint,31.41,2,59.26,53.58,false,2026-09-30,',
  'Main,Yu-Gi-Oh!,,Mirrorblade Knight,,,,,Lightly Played,4.00,1,6.10,,false,2026-09-30,',
  'Main,Yu-Gi-Oh!,Some Set,Nobody Knows Me,EN404,Common,,,,1.00,3,1.20,,false,2026-09-30,',
  '',
].join('\n');

async function itemCount(page: Page, token: string): Promise<number> {
  const response = await page.request.get(`${API_URL}/api/v1/inventory/items`, {
    headers: authHeader(token),
    params: { size: 100 },
  });
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { totalItems: number }).totalItems;
}

test.describe('inventory import (web WB)', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test('a fictional .ydk deck file and a fictional Collectr CSV, from the file to the inventory', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'wbimport');
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, collector.email, collector.password);

    // Source: the deck file, with the server's limits.
    await page.goto('/inventory');
    await page.getByTestId('inventory-add-menu').click();
    await page.getByRole('menuitem', { name: 'Import a deck (.ydk)' }).click();
    await expect(page).toHaveURL(/\/inventory\/import\?source=ydk$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Import cards' })).toBeVisible();
    await expect(page.getByTestId('import-limits')).toContainText('Up to 100 kB and 500 lines');
    await expect(page.getByText('The preview is kept for 60 minutes.')).toBeVisible();
    await expect(
      page.getByText("Your file's cards show here before anything is added."),
    ).toBeVisible();
    await page.getByTestId('import-file').setInputFiles({
      name: 'fixture-deck.ydk',
      mimeType: 'text/plain',
      buffer: Buffer.from(DECK),
    });

    // Check: every line, the chips, the amber bar; nothing is added yet.
    await expect(page.getByText('3 main, 1 extra, 2 side')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'All 4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Which copy? 2' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Not recognised 1' })).toBeVisible();
    await expect(page.getByTestId('import-choose-bar')).toContainText(
      '2 cards need a printing. Pick one on each, or use the newest for all.',
    );
    await expect(
      page.getByText('Choose the copy of the marked cards, or use the newest.'),
    ).toBeVisible();
    await expect(page.getByTestId('import-commit')).toBeDisabled();
    expect(await itemCount(page, collector.idToken)).toBe(0);
    await expect(page.getByTestId('import-row-3')).toContainText('919999999');
    await expect(page.getByTestId('import-row-3')).toContainText('Not recognised');

    // One printing by hand, the other with "Use the newest".
    await page
      .getByRole('button', { name: 'Choose a printing of Fixture Clockwork Heron' })
      .first()
      .click();
    await page.getByRole('menuitem').first().click();
    await expect(page.getByRole('button', { name: 'Which copy? 1' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId('import-newest').click();
    await expect(page.getByTestId('import-choose-bar')).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId('import-commit')).toBeEnabled();
    // A card is one row, one printing: the Heron and its alternate artwork may become one card.
    const label = (await page.getByTestId('import-commit').textContent()) ?? '';
    const deckCards = Number(/Add (\d+) cards?/.exec(label)?.[1]);
    expect(deckCards).toBeGreaterThanOrEqual(2);
    await expect(page.locator('footer').getByText(`${deckCards} cards ·`)).toBeVisible();

    // Done: what was added, and what stayed out.
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('import-done')).toHaveText(`${deckCards} cards added`, {
      timeout: 30_000,
    });
    await expect(
      page.getByText('They start private. Make the ones you trade public from Inventory.'),
    ).toBeVisible();
    await expect(page.getByText('Not recognised · 1')).toBeVisible();
    await expect(page.getByText('Card id 919999999')).toBeVisible();
    expect(await itemCount(page, collector.idToken)).toBe(deckCards);
    await page.getByTestId('import-go').click();
    await expect(page).toHaveURL(/\/inventory$/);
    await expect(
      page.locator('[role="row"][data-item-id]', { hasText: 'Fixture Lantern Wisp' }),
    ).toContainText('×2');

    // The Collectr export: another file, the same states.
    await page.goto('/inventory/import?source=csv');
    await expect(page.getByTestId('import-limits')).toContainText('Up to 2 MB and 5,000 rows');
    await page.getByTestId('import-file').setInputFiles({
      name: 'collectr-export.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(EXPORT),
    });
    await expect(page.getByRole('button', { name: 'All 3' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Not recognised 1' })).toBeVisible();
    await expect(page.getByTestId('import-row-2')).toContainText('Nobody Knows Me');
    if (await page.getByTestId('import-newest').isVisible()) {
      await page.getByTestId('import-newest').click();
      await expect(page.getByTestId('import-choose-bar')).toHaveCount(0, { timeout: 30_000 });
    }
    await page.getByTestId('import-commit').click();
    await expect(page.getByTestId('import-done')).toHaveText('2 cards added', { timeout: 30_000 });
    expect(await itemCount(page, collector.idToken)).toBe(deckCards + 2);

    // A file the server refuses says why, in plain words.
    await page.getByRole('button', { name: 'Import another file' }).click();
    await page.getByTestId('import-file').setInputFiles({
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Product Name,Quantity\n'),
    });
    await expect(page.getByTestId('import-problem')).toContainText('No card in this file');

    await watcher.settle();
    expect(coordinateLeaks(watcher.samples)).toEqual([]);
  });
});
