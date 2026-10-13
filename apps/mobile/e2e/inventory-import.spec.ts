import type { APIRequestContext, Locator, Page } from '@playwright/test';

import { expect, test } from './support/fixtures';
import {
  API_URL,
  PHOTO_PNG,
  apiAddItem,
  authHeader,
  createOnboardedCollector,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
  type OnboardedCollector,
} from './support/stack';

/*
 * Stage S5, the inventory import on the phone, against the real stack: a fictional deck file
 * (.ydk) and a fictional Collectr CSV export go from the upload to the inventory.
 *
 * The deck file is written for the three fictional passcodes the isolated database gets
 * (SEED_IMPORT_FIXTURES, `ImportFixtureSeedContributor`): 910000001 "Fixture Lantern Wisp" (one
 * printing), 910000002 "Fixture Clockwork Heron" (two printings) and 910000003, an alternate
 * artwork of the Heron. The CSV names cards of the sample catalog. No card provider, no Collectr.
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

interface Item {
  id: string;
  quantity: number;
  condition: string;
  edition: string;
  visibility: string;
  availability: string;
  binder: { id: string } | null;
  card: { name: string };
  printing: { id: string; printingCode: string };
}

async function items(request: APIRequestContext, token: string): Promise<Item[]> {
  const response = await request.get(`${API_URL}/api/v1/inventory/items?size=50`, {
    headers: authHeader(token),
  });
  expect(response.ok(), 'GET /inventory/items').toBeTruthy();
  return ((await response.json()) as { items: Item[] }).items;
}

/** The printing of a card with a printing code and an edition (two printings can share a code). */
async function printingOf(
  request: APIRequestContext,
  token: string,
  cardName: string,
  code: string,
  edition: string
): Promise<string> {
  const found = await request.get(`${API_URL}/api/v1/cards`, {
    headers: authHeader(token),
    params: { query: cardName },
  });
  expect(found.ok(), `GET /cards ${cardName}`).toBeTruthy();
  const card = ((await found.json()) as { items: { id: string; name: string }[] }).items.find(
    (candidate) => candidate.name === cardName
  );
  expect(card, `${cardName} in the sample catalog`).toBeTruthy();
  const detail = await request.get(`${API_URL}/api/v1/cards/${card!.id}`, {
    headers: authHeader(token),
  });
  const printing = (
    (await detail.json()) as { printings: { id: string; printingCode: string; edition: string }[] }
  ).printings.find((candidate) => candidate.printingCode === code && candidate.edition === edition);
  expect(printing, `${code} ${edition}`).toBeTruthy();
  return printing!.id;
}

async function openImport(page: Page, collector: OnboardedCollector): Promise<Locator> {
  await signInThroughUi(page, collector.email, collector.password);
  await openTab(page, 'Inventory');
  await screen(page, 'inventory').getByRole('button', { name: 'Import cards from a file' }).click();
  const flow = screen(page, 'import');
  await expect(flow.getByText('Where do your cards come from?')).toBeVisible({ timeout: 30_000 });
  return flow;
}

/** The count of one of the four tiles on top of a preview. */
function stat(flow: Locator, key: 'new' | 'merged' | 'choose' | 'unmatched'): Locator {
  return flow.getByTestId(`import-summary-${key}`);
}

test.describe('mobile inventory import', () => {
  requireStack();

  test('a deck file: a file that is refused, the preview, printings, the bulk actions and the commit', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const collector = await createOnboardedCollector(request, 'ydk', 'Mobile Deck Importer');
    const flow = await openImport(page, collector);

    await flow.getByRole('button', { name: 'Yu-Gi-Oh! deck file (.ydk)' }).click();
    await expect(flow.getByTestId('import-limits')).toHaveText('Up to 100 kB and 500 lines.');

    // A picture is not a deck file: refused in words, nothing kept.
    const wrong = page.waitForEvent('filechooser');
    await flow.getByRole('button', { name: 'Choose a file' }).click();
    await (
      await wrong
    ).setFiles({ name: 'deck.ydk', mimeType: 'application/octet-stream', buffer: PHOTO_PNG });
    await expect(flow.getByTestId('import-refusal')).toContainText('This is not a text file', {
      timeout: 30_000,
    });
    await expect(flow.getByTestId('import-refusal')).toContainText('choose the .ydk file itself');

    // The deck file, through the system file picker.
    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/inventory/imports'
    );
    const chooser = page.waitForEvent('filechooser');
    await flow.getByRole('button', { name: 'Choose a file' }).click();
    await (
      await chooser
    ).setFiles({ name: 'fictional-deck.ydk', mimeType: 'text/plain', buffer: Buffer.from(DECK) });
    const uploaded = await upload;
    expect(uploaded.status()).toBe(201);
    expect(new URL(uploaded.url()).searchParams.get('source')).toBe('YDK');
    const importId = ((await uploaded.json()) as { id: string }).id;

    // The preview: one card is ready, two need a printing, one passcode is unknown.
    await expect(stat(flow, 'new')).toHaveText('1new card', { timeout: 30_000 });
    await expect(stat(flow, 'merged')).toHaveText('0added to cards you own');
    await expect(stat(flow, 'choose')).toHaveText('2need a printing');
    await expect(stat(flow, 'unmatched')).toHaveText('1not recognised');
    await expect(flow.getByTestId('import-summary-sentence')).toHaveText(
      '2 copies from 1 of the 4 lines of your file.'
    );
    await expect(flow.getByRole('switch', { name: 'Main deck' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(flow.getByTestId('import-section-includeMain')).toContainText(
      '3 cards in your file'
    );
    await expect(flow.getByTestId('import-section-includeSide')).toContainText(
      '2 cards in your file'
    );
    // Nothing is in the inventory yet.
    expect(await items(request, collector.idToken)).toHaveLength(0);

    // The commit says why it cannot be pressed.
    const commit = flow.getByTestId('import-commit');
    await expect(commit).toHaveAttribute('aria-disabled', 'true');
    await expect(flow.getByTestId('import-commit-reason')).toHaveText(
      '2 cards still need a printing. Choose them, or leave those cards out.'
    );

    // The card that fits one printing is preselected; the default condition is shown.
    const wisp = flow.getByTestId('import-row-0');
    await expect(wisp).toContainText('Fixture Lantern Wisp');
    await expect(wisp).toContainText('YDKF-EN001');
    await expect(wisp).toContainText('Damaged (not in your file) · ×2');
    await expect(wisp).toContainText('Main 2');

    // "Needs a printing": the Heron and its alternate artwork.
    await flow.getByRole('radio', { name: 'Needs a printing (2)' }).click();
    await expect(flow.getByTestId('import-row-1')).toBeVisible({ timeout: 30_000 });
    await expect(flow.getByTestId('import-row-2')).toBeVisible();
    await expect(flow.getByTestId('import-row-0')).toHaveCount(0);

    // One printing chosen by hand (the first set), in the "Which copy" sheet.
    await flow
      .getByRole('button', { name: 'Which copy of Fixture Clockwork Heron: Choose printing' })
      .first()
      .click();
    const sheet = page.getByTestId('import-printing-sheet');
    await expect(sheet.getByTestId('import-printing-card')).toHaveText('Fixture Clockwork Heron');
    await expect(sheet).toContainText('2 printings. Pick the one you own.');
    await sheet.getByRole('radio', { name: /^YDKF-EN002/ }).click();
    await expect(stat(flow, 'choose')).toHaveText('1needs a printing', { timeout: 30_000 });
    await expect(flow.getByRole('radio', { name: 'Needs a printing (1)' })).toBeVisible();
    await expect(flow.getByTestId('import-row-1')).toHaveCount(0);

    // The other one by the bulk action: the most recent printing by release date.
    await flow
      .getByRole('button', { name: 'Use the most recent printing for all unchosen rows' })
      .click();
    await expect(snackbar(page)).toHaveText('1 card got its most recent printing.', {
      timeout: 30_000,
    });
    await expect(flow.getByText('No card needs a printing')).toBeVisible({ timeout: 30_000 });
    await flow.getByRole('button', { name: 'Show all lines' }).click();
    await expect(flow.getByTestId('import-row-2')).toContainText('YDKR-EN002');
    await expect(flow.getByTestId('import-row-1')).toContainText('YDKF-EN002');

    // The passcode nothing fits is reported with what the file said, and has no control.
    await flow.getByRole('radio', { name: 'Not recognised (1)' }).click();
    const unknown = flow.getByTestId('import-row-3');
    await expect(unknown).toContainText('Passcode 919999999', { timeout: 30_000 });
    await expect(unknown).toContainText('No card of the catalog has this passcode.');
    await expect(unknown.getByRole('button')).toHaveCount(0);
    await flow.getByRole('radio', { name: 'All (4)' }).click();

    // One condition for the cards whose file names none (a deck file names none).
    await flow.getByRole('button', { name: 'Set one condition for these 3 cards' }).click();
    await page.getByTestId('import-condition-NEAR_MINT').click();
    await expect(snackbar(page)).toHaveText('3 cards set to Near Mint.', { timeout: 30_000 });
    await expect(flow.getByTestId('import-row-0')).toContainText(
      'Near Mint (not in your file) · ×2'
    );

    // The side deck no longer counts: the Heron keeps its main copy only.
    await flow.getByRole('switch', { name: 'Side deck' }).click();
    await expect(flow.getByTestId('import-summary-sentence')).toHaveText(
      '4 copies from 3 of the 4 lines of your file.',
      { timeout: 30_000 }
    );
    await expect(flow.getByTestId('import-row-1')).toContainText('×1');

    // Condition and copies of one line.
    await flow
      .getByRole('button', { name: /^Condition and copies of Fixture Lantern Wisp/ })
      .click();
    const dialog = page.getByTestId('import-row-dialog');
    await dialog.getByRole('radio', { name: 'Lightly Played' }).click();
    await dialog.getByLabel('Copies').fill('0');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText('At least 1 copy.')).toBeVisible();
    await dialog.getByLabel('Copies').fill('3');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(flow.getByTestId('import-row-0')).toContainText('Lightly Played · ×3', {
      timeout: 30_000,
    });

    // A line left out, then put back.
    await flow.getByRole('checkbox', { name: 'Import Fixture Lantern Wisp' }).click();
    await expect(flow.getByTestId('import-row-0-state')).toHaveText('Left out');
    await expect(commit).toHaveAccessibleName('Add 2 cards to my inventory', { timeout: 30_000 });
    await flow.getByRole('checkbox', { name: 'Import Fixture Lantern Wisp' }).click();
    await expect(commit).toHaveAccessibleName('Add 3 cards to my inventory', { timeout: 30_000 });
    await expect(flow.getByTestId('import-commit-reason')).toHaveText(
      'They start private: nobody sees them until you publish them.'
    );
    expect(await items(request, collector.idToken)).toHaveLength(0);

    // The commit and its result.
    await commit.click();
    const result = flow.getByTestId('import-result');
    await expect(result.getByText('Import done')).toBeVisible({ timeout: 30_000 });
    await expect(result.getByTestId('import-result-added')).toContainText('3new cards added');
    await expect(result.getByTestId('import-result-merged')).toContainText('0');
    await expect(result.getByTestId('import-result-leftOut')).toContainText(
      '1line of your file left out'
    );
    await expect(result.getByTestId('import-result-leftOut')).toContainText('1 not recognised');
    await expect(result.getByTestId('import-result-note')).toContainText('5 copies in all.');

    // What the API holds: three private, unfiled cards.
    const held = await items(request, collector.idToken);
    expect(
      held.map((item) => `${item.printing.printingCode} ${item.condition} x${item.quantity}`).sort()
    ).toEqual([
      'YDKF-EN001 LIGHTLY_PLAYED x3',
      'YDKF-EN002 NEAR_MINT x1',
      'YDKR-EN002 NEAR_MINT x1',
    ]);
    for (const item of held) {
      expect(item.visibility).toBe('PRIVATE');
      expect(item.availability).toBe('COLLECTION_ONLY');
      expect(item.binder).toBeNull();
    }

    // The same commit sent again adds nothing and answers the same.
    const again = await request.post(`${API_URL}/api/v1/inventory/imports/${importId}/commit`, {
      headers: authHeader(collector.idToken),
    });
    expect(again.status()).toBe(200);
    expect(((await again.json()) as { result: { itemsCreated: number } }).result.itemsCreated).toBe(
      3
    );
    expect(await items(request, collector.idToken)).toHaveLength(3);

    // The way to the inventory: the cards, private.
    await result.getByRole('button', { name: 'Go to my inventory' }).click();
    const inventory = screen(page, 'inventory');
    const row = inventory.getByRole('button', { name: /^Fixture Lantern Wisp, YDKF-EN001/ });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText('×3');
    await expect(row).toContainText('Private');
    await expect(inventory.getByTestId('inventory-summary-totals')).toHaveText(
      '3 cards · 5 copies · 0 public now'
    );
  });

  test('a Collectr CSV, pasted: a column that is missing, a merge with a card already owned, an unknown row', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const collector = await createOnboardedCollector(request, 'csv', 'Mobile Sheet Importer');
    // The collector already has two near mint first edition copies of AZR-EN001.
    const owned = await apiAddItem(
      request,
      collector,
      await printingOf(
        request,
        collector.idToken,
        'Azure-Eyes Sky Dragon',
        'AZR-EN001',
        'FIRST_EDITION'
      ),
      { quantity: 2 }
    );
    const flow = await openImport(page, collector);

    await flow.getByRole('button', { name: 'Collectr CSV export' }).click();
    await expect(flow.getByTestId('import-limits')).toHaveText('Up to 2 MB and 5,000 rows.');
    await flow.getByRole('button', { name: 'Paste the text of the file' }).click();

    // A file whose card name column cannot be found is refused, and the column is named.
    await flow.getByLabel('Text of the CSV export').fill('Set,Quantity\nAzure Dawn,2\n');
    await flow.getByRole('button', { name: 'Use this text' }).click();
    const refusal = flow.getByTestId('import-refusal');
    await expect(refusal).toContainText('A column could not be found', { timeout: 30_000 });
    await expect(refusal).toContainText('This file has no “card name” column.');

    // The export, pasted: the same upload as a file.
    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v1/inventory/imports'
    );
    await flow.getByLabel('Text of the CSV export').fill(EXPORT);
    await flow.getByRole('button', { name: 'Use this text' }).click();
    const uploaded = await upload;
    expect(uploaded.status()).toBe(201);
    expect(uploaded.request().headers()['content-type']).toContain('multipart/form-data');
    expect(new URL(uploaded.url()).searchParams.get('source')).toBe('COLLECTR_CSV');

    // The dragon goes into the copies already owned; the knight needs a printing; one row fits nothing.
    await expect(stat(flow, 'new')).toHaveText('0new cards', { timeout: 30_000 });
    await expect(stat(flow, 'merged')).toHaveText('1added to a card you own');
    await expect(stat(flow, 'choose')).toHaveText('1needs a printing');
    await expect(stat(flow, 'unmatched')).toHaveText('1not recognised');
    await expect(flow.getByTestId('import-sections')).toHaveCount(0);
    const dragon = flow.getByTestId('import-row-0');
    await expect(dragon).toContainText('Azure-Eyes Sky Dragon');
    await expect(dragon).toContainText('AZR-EN001');
    await expect(dragon).toContainText('1st Edition');
    await expect(dragon).toContainText('Near Mint · ×2');
    await expect(flow.getByTestId('import-row-0-owned')).toHaveText('You have 2: this adds 2.');
    // The row nothing fits, with what the file said. Never a price.
    const nobody = flow.getByTestId('import-row-2');
    await expect(nobody).toContainText('Not recognised');
    await expect(nobody).toContainText('Nobody Knows Me');
    await expect(nobody).toContainText('Some Set · EN404 · Common · 3 copies');
    await expect(flow).not.toContainText('59.26');
    await expect(flow).not.toContainText('31.41');

    // Leaving the knight out is a choice the collector makes; here it gets a printing instead.
    await flow.getByRole('checkbox', { name: /^Leave out the 1 card/ }).click();
    await expect(flow.getByTestId('import-commit')).toHaveAccessibleName('Add 1 card, leave 1 out');
    await flow.getByRole('checkbox', { name: /^Leave out the 1 card/ }).click();
    await flow
      .getByRole('button', { name: 'Which copy of Mirrorblade Knight: Choose printing' })
      .click();
    const sheet = page.getByTestId('import-printing-sheet');
    await sheet.getByRole('radio').first().click();
    await expect(stat(flow, 'new')).toHaveText('1new card', { timeout: 30_000 });
    await expect(stat(flow, 'choose')).toHaveText('0need a printing');
    await expect(flow.getByTestId('import-commit-reason')).toHaveText(
      'New cards start private. 1 of them is added to a card you already have.'
    );

    await flow.getByTestId('import-commit').click();
    const result = flow.getByTestId('import-result');
    await expect(result.getByTestId('import-result-added')).toContainText('1new card added', {
      timeout: 30_000,
    });
    await expect(result.getByTestId('import-result-merged')).toContainText(
      '1card you already had got more copies'
    );
    await expect(result.getByTestId('import-result-leftOut')).toContainText('1 not recognised');

    // The API: the owned item holds 4 now (not a second item), the knight is new and private.
    const held = await items(request, collector.idToken);
    expect(held).toHaveLength(2);
    const dragonItem = held.find((item) => item.id === owned.id);
    expect(dragonItem?.quantity).toBe(4);
    const knight = held.find((item) => item.card.name === 'Mirrorblade Knight');
    expect(knight).toMatchObject({
      quantity: 1,
      condition: 'LIGHTLY_PLAYED',
      visibility: 'PRIVATE',
    });

    // "Import another file" starts over with nothing left open.
    await result.getByRole('button', { name: 'Import another file' }).click();
    await expect(flow.getByText('Where do your cards come from?')).toBeVisible({ timeout: 30_000 });
    await expect(flow.getByTestId('import-open')).toHaveCount(0);
  });

  test('an import left open is picked up again, and discarded only after a question', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'resume', 'Mobile Resumer');
    const flow = await openImport(page, collector);
    await flow.getByRole('button', { name: 'Yu-Gi-Oh! deck file (.ydk)' }).click();
    await flow.getByRole('button', { name: 'Paste the text of the file' }).click();
    await flow.getByLabel('Text of the deck file').fill(DECK);
    await flow.getByRole('button', { name: 'Use this text' }).click();
    await expect(stat(flow, 'choose')).toHaveText('2need a printing', { timeout: 30_000 });
    // A choice made in the preview: the extra deck (the alternate artwork) does not count.
    await flow.getByRole('switch', { name: 'Extra deck' }).click();
    await expect(flow.getByTestId('import-summary-sentence')).toHaveText(
      '2 copies from 1 of the 4 lines of your file. 1 left out.',
      { timeout: 30_000 }
    );
    await expect(stat(flow, 'choose')).toHaveText('1needs a printing');

    // Leaving asks first: nothing was added, and the preview is kept.
    const back = page.locator('[aria-label$=", back"]').filter({ visible: true }).first();
    await back.click();
    const leave = page.getByTestId('import-leave-dialog');
    await expect(leave).toContainText('Leave this import?');
    await expect(leave).toContainText('Nothing has been added to your inventory yet.');
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(flow.getByTestId('import-summary')).toBeVisible();
    await back.click();
    await page.getByTestId('import-leave-dialog').getByRole('button', { name: 'Leave' }).click();

    // Opened again later: the import is offered, with the choices made in it.
    await screen(page, 'inventory')
      .getByRole('button', { name: 'Import cards from a file' })
      .click();
    const again = screen(page, 'import');
    const open = again.getByTestId('import-open');
    await expect(open).toContainText('Continue your import', { timeout: 30_000 });
    await expect(open).toContainText('Deck file · 4 lines · kept until');
    await open.getByRole('button', { name: 'Continue' }).click();
    await expect(again.getByRole('switch', { name: 'Extra deck' })).toHaveAttribute(
      'aria-checked',
      'false',
      { timeout: 30_000 }
    );

    // Discarding asks first.
    await again.getByRole('button', { name: 'Discard this import' }).click();
    const dialog = page.getByTestId('import-discard-dialog');
    await expect(dialog).toContainText('Discard this import?');
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(again.getByTestId('import-summary')).toBeVisible();
    await again.getByRole('button', { name: 'Discard this import' }).click();
    await page
      .getByTestId('import-discard-dialog')
      .getByRole('button', { name: 'Discard' })
      .click();
    await expect(snackbar(page)).toHaveText('Import discarded. Nothing was added.', {
      timeout: 30_000,
    });
    await expect(again.getByText('Where do your cards come from?')).toBeVisible({
      timeout: 30_000,
    });
    await expect(again.getByTestId('import-open')).toHaveCount(0);
    expect(await items(request, collector.idToken)).toHaveLength(0);
    const left = await request.get(`${API_URL}/api/v1/inventory/imports`, {
      headers: authHeader(collector.idToken),
    });
    expect(await left.json()).toEqual([]);
  });
});
