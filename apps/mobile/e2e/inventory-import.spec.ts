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

/** Add cards → "Import a deck" or "Import from Collectr" (stage R2). */
async function pickSource(page: Page, source: 'deck' | 'collectr'): Promise<void> {
  await screen(page, 'add-cards-start')
    .getByRole('button', { name: source === 'deck' ? 'Import a deck' : 'Import from Collectr' })
    .click();
}

/** Inventory → Add cards → the source. */
async function chooseImport(page: Page, source: 'deck' | 'collectr'): Promise<void> {
  await screen(page, 'inventory').getByRole('button', { name: 'Add cards' }).first().click();
  await pickSource(page, source);
}

/** Signs in and opens the file step of an import from Add cards (nothing is left open yet). */
async function openImport(
  page: Page,
  collector: OnboardedCollector,
  source: 'deck' | 'collectr'
): Promise<Locator> {
  await signInThroughUi(page, collector.email, collector.password);
  await openTab(page, 'Inventory');
  await chooseImport(page, source);
  const flow = screen(page, 'import');
  await expect(flow.getByTestId('import-limits')).toBeVisible({ timeout: 30_000 });
  return flow;
}

test.describe('mobile inventory import', () => {
  requireStack();

  test('a deck file: a file that is refused, the preview, printings, the bulk actions and the commit', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const collector = await createOnboardedCollector(request, 'ydk', 'Mobile Deck Importer');
    const flow = await openImport(page, collector, 'deck');

    await expect(flow.getByTestId('import-limits')).toHaveText('Up to 100 kB and 500 lines.');

    // A picture is not a deck file: refused in words, nothing kept.
    const wrong = page.waitForEvent('filechooser');
    await flow.getByRole('button', { name: 'Choose a file' }).click();
    await (
      await wrong
    ).setFiles({ name: 'deck.ydk', mimeType: 'application/octet-stream', buffer: PHOTO_PNG });
    await expect(flow.getByTestId('import-refusal')).toContainText(
      'This file could not be read as text',
      {
        timeout: 30_000,
      }
    );
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

    // "Check the cards" (stage R14, mockup v50 screen 67): the file picked on this phone with its
    // sections, the chips with their counts, the amber bar. One card is ready, two need a
    // printing, one passcode is unknown.
    await expect(flow.getByTestId('import-summary')).toHaveText(
      'fictional-deck.ydk · 3 main, 1 extra, 2 side',
      { timeout: 30_000 }
    );
    await expect(flow.getByRole('radio', { name: 'All 4' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(flow.getByRole('radio', { name: 'Which copy? 2' })).toBeVisible();
    await expect(flow.getByRole('radio', { name: 'Not recognised 1' })).toBeVisible();
    await expect(flow.getByTestId('import-unchosen')).toContainText(
      '2 cards need a printing. Pick one on each, or use the newest for all.'
    );
    await expect(flow.getByTestId('import-summary-sentence')).toHaveText(
      'Your file lists 4 different cards. 1 is ready to add: 2 copies.'
    );
    await expect(flow.getByRole('switch', { name: 'Main deck' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(flow.getByTestId('import-section-includeMain')).toContainText(
      '3 copies in your file'
    );
    await expect(flow.getByTestId('import-section-includeSide')).toContainText(
      '2 copies in your file'
    );
    // Nothing is in the inventory yet.
    expect(await items(request, collector.idToken)).toHaveLength(0);

    // The commit says why it cannot be pressed.
    const commit = flow.getByTestId('import-commit');
    await expect(commit).toHaveAttribute('aria-disabled', 'true');
    await expect(flow.getByTestId('import-commit-reason')).toHaveText(
      'Choose the copy of the marked cards, or use the newest.'
    );

    // The card that fits one printing is preselected; its copies show alone ("×2", mockup v50
    // screen 67: the file names no condition; R14 review fix 1, U6), the condition the line
    // starts at is in its name for VoiceOver.
    const wisp = flow.getByTestId('import-row-0');
    await expect(wisp).toContainText('Fixture Lantern Wisp');
    await expect(wisp).toContainText('YDKF-EN001 · Rare');
    await expect(wisp).toContainText('×2');
    await expect(wisp).not.toContainText('DMG');
    await expect(
      flow.getByRole('button', {
        name: 'Condition and copies of Fixture Lantern Wisp: Damaged (not in your file), 2 copies',
      })
    ).toBeVisible();
    // The Heron stands on two lines (two artworks): each says what the file said.
    await expect(flow.getByTestId('import-row-1-source')).toHaveText('Passcode 910000002');

    // The filter stays on screen above the list.
    await flow.getByRole('radio', { name: 'Not recognised 1' }).click();
    await expect(flow.getByRole('radio', { name: 'Not recognised 1' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await expect(flow.getByTestId('import-row-3')).toBeVisible({ timeout: 30_000 });
    await flow.getByRole('radio', { name: 'All 4' }).click();
    await expect(flow.getByTestId('import-row-0')).toBeVisible({ timeout: 30_000 });

    // "Which copy?": the Heron and its alternate artwork.
    await flow.getByRole('radio', { name: 'Which copy? 2' }).click();
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
    // What the file said, to check the match against.
    await expect(sheet.getByTestId('import-printing-source')).toContainText('Passcode 91000000');
    await expect(sheet).toContainText('2 printings. Pick the one you own.');
    await sheet.getByRole('radio', { name: /^YDKF-EN002/ }).click();
    await expect(flow.getByRole('radio', { name: 'Which copy? 1' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(flow.getByTestId('import-row-1')).toHaveCount(0);

    // The other one by the bulk action: the most recent printing by release date.
    await flow.getByRole('button', { name: 'Use the newest' }).click();
    await expect(snackbar(page)).toHaveText('1 card got its most recent printing.', {
      timeout: 30_000,
    });
    await expect(flow.getByText('Nothing needs a printing')).toBeVisible({ timeout: 30_000 });
    await flow.getByRole('button', { name: 'Show all different cards' }).click();
    await expect(flow.getByTestId('import-row-2')).toContainText('YDKR-EN002');
    await expect(flow.getByTestId('import-row-1')).toContainText('YDKF-EN002');

    // The passcode nothing fits is reported with what the file said, and has no control.
    await flow.getByRole('radio', { name: 'Not recognised 1' }).click();
    const unknown = flow.getByTestId('import-row-3');
    await expect(unknown).toContainText('Passcode 919999999', { timeout: 30_000 });
    // Said for what it is (mockup v50 screen 67), with the deck section and what can be done
    // next; why, for VoiceOver.
    await expect(unknown).toContainText('Not recognised. It stays out.');
    await expect(unknown).toHaveAccessibleName(
      /No card of the catalog has this passcode \(the number printed in the lower left corner of a card\)\./
    );
    await expect(unknown).toContainText('Side 1');
    await expect(flow.getByTestId('import-row-3-next')).toHaveText(
      'If you know which card it is, find the card by its name with “Add cards” in your inventory.'
    );
    await expect(unknown.getByRole('button')).toHaveCount(0);
    await flow.getByRole('radio', { name: 'All 4' }).click();

    // One condition for the cards whose file names none (a deck file names none).
    await flow.getByRole('button', { name: 'Set one condition for these 3 cards' }).click();
    await expect(flow.getByTestId('import-default-conditions')).toContainText(
      'starts at the lowest grade (Damaged)'
    );
    await page.getByTestId('import-condition-NEAR_MINT').click();
    await expect(snackbar(page)).toHaveText('3 cards set to Near Mint.', { timeout: 30_000 });
    // The card says what they are set to now, not where they started.
    await expect(flow.getByTestId('import-default-conditions')).toContainText(
      'You set them to Near Mint.'
    );
    await expect(flow.getByTestId('import-default-conditions')).not.toContainText('lowest grade');
    await expect(
      flow.getByRole('button', { name: 'Change the condition of these 3 cards' })
    ).toBeVisible();
    await expect(flow.getByTestId('import-row-0')).toContainText('NM ×2');

    // The side deck no longer counts: the Heron keeps its main copy only.
    await flow.getByRole('switch', { name: 'Side deck' }).click();
    await expect(flow.getByTestId('import-summary-sentence')).toHaveText(
      'Your file lists 4 different cards. 3 are ready to add: 4 copies.',
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
    await expect(flow.getByTestId('import-row-0')).toContainText('LP ×3', {
      timeout: 30_000,
    });

    // A line left out, then put back.
    await flow.getByRole('checkbox', { name: 'Leave out Fixture Lantern Wisp' }).click();
    await expect(flow.getByTestId('import-row-0-state')).toHaveText('Left out');
    await expect(commit).toHaveAccessibleName('Add 2 cards to my inventory', { timeout: 30_000 });
    await flow.getByRole('checkbox', { name: 'Include Fixture Lantern Wisp' }).click();
    // Three cards, five copies: the copies stand next to the cards.
    await expect(commit).toHaveAccessibleName('Add 3 cards (5 copies) to my inventory', {
      timeout: 30_000,
    });
    await expect(flow.getByTestId('import-commit-reason')).toHaveText(
      'They start private: nobody sees them until you publish them.'
    );
    expect(await items(request, collector.idToken)).toHaveLength(0);

    // The commit and its result.
    await commit.click();
    const result = flow.getByTestId('import-result');
    // "Import done" (mockup v50 screen 68): the title in the top bar, the count, "They start
    // private."
    await expect(flow.getByText('Import done')).toBeVisible({ timeout: 30_000 });
    await expect(result.getByText('3 cards added')).toBeVisible();
    await expect(result).toContainText(
      'They start private. Make the ones you trade public from Inventory.'
    );
    await expect(result.getByTestId('import-result-added')).toContainText('3new cards added');
    await expect(result.getByTestId('import-result-merged')).toContainText('0');
    await expect(result.getByTestId('import-result-leftOut')).toContainText(
      '1different card of your file left out'
    );
    await expect(result.getByTestId('import-result-leftOut')).toContainText('1 not recognised');
    await expect(result.getByTestId('import-result-note')).toContainText('5 copies in all.');
    await expect(result.getByTestId('import-result-note')).toContainText(
      'Everything this import added is private'
    );
    // The line that was not added stays readable on the result, with what can be done about it.
    const lost = result.getByTestId('import-result-unmatched');
    await expect(lost).toContainText('NOT RECOGNISED · 1');
    await expect(lost.getByTestId('import-row-3')).toContainText('Passcode 919999999', {
      timeout: 30_000,
    });
    await expect(lost.getByTestId('import-row-3')).toContainText('“Add cards” in your inventory');

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
    await expect(inventory.getByTestId('inventory-summary-totals')).toHaveText(
      '3 cards · 5 copies · 0 public'
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
    const flow = await openImport(page, collector, 'collectr');

    await expect(flow.getByTestId('import-limits')).toHaveText('Up to 2 MB and 5,000 rows.');
    await flow.getByRole('button', { name: 'Paste the text of the file instead' }).click();

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

    // The dragon goes into the copies already owned; the knight needs a printing; one row fits
    // nothing. A pasted text has no file name.
    await expect(flow.getByTestId('import-summary')).toHaveText('Your CSV export · 3 lines', {
      timeout: 30_000,
    });
    await expect(flow.getByRole('radio', { name: 'Which copy? 1' })).toBeVisible();
    await expect(flow.getByRole('radio', { name: 'Not recognised 1' })).toBeVisible();
    await expect(flow.getByTestId('import-sections')).toHaveCount(0);
    const dragon = flow.getByTestId('import-row-0');
    await expect(dragon).toContainText('Azure-Eyes Sky Dragon');
    await expect(dragon).toContainText('AZR-EN001 · Ultra Rare');
    await expect(dragon).toContainText('NM ×2');
    await expect(flow.getByTestId('import-row-0-owned')).toHaveText('You have 2: this adds 2.');
    // The file's own words, in the "Which copy" sheet.
    await dragon.getByRole('button', { name: /^Which copy of Azure-Eyes Sky Dragon/ }).click();
    await expect(page.getByTestId('import-printing-source')).toHaveText(
      'In your file: Azure Dawn · AZR-EN001 · Ultra Rare'
    );
    await page.getByTestId('import-printing-sheet-backdrop').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('import-printing-sheet')).toHaveCount(0, { timeout: 30_000 });
    // The row nothing fits, with what the file said. Never a price.
    const nobody = flow.getByTestId('import-row-2');
    await expect(nobody).toContainText('Not recognised. It stays out.');
    await expect(nobody).toContainText('Nobody Knows Me');
    await expect(nobody).toContainText('Some Set · EN404 · Common · 3 copies');
    await expect(flow).not.toContainText('59.26');
    await expect(flow).not.toContainText('31.41');

    // Leaving the knight out is a choice the collector makes; here it gets a printing instead.
    await flow.getByRole('checkbox', { name: /^Leave out the 1 line/ }).click();
    await expect(flow.getByTestId('import-commit')).toHaveAccessibleName(
      'Add 1 card, leave 1 out (2 copies added)'
    );
    await flow.getByRole('checkbox', { name: /^Leave out the 1 line/ }).click();
    await flow
      .getByRole('button', { name: 'Which copy of Mirrorblade Knight: Choose printing' })
      .click();
    const sheet = page.getByTestId('import-printing-sheet');
    await sheet.getByRole('radio').first().click();
    await expect(flow.getByRole('radio', { name: 'Which copy? 0' })).toBeVisible({
      timeout: 30_000,
    });
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

    // "Import another file" opens the file step of the same source (mockup v50 screen 68), with
    // nothing left open.
    await result.getByRole('button', { name: 'Import another file' }).click();
    await expect(flow.getByTestId('import-file-COLLECTR_CSV')).toBeVisible({ timeout: 30_000 });
    await expect(flow.getByTestId('import-open')).toHaveCount(0);
  });

  test('the lines whose copy was assumed stay counted and can be listed after the snackbar is gone', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const collector = await createOnboardedCollector(request, 'plain', 'Mobile Plain Copies');
    const flow = await openImport(page, collector, 'collectr');

    // Two cards named without a set: each has a 1st Edition and an Unlimited copy in its one set
    // (the sample catalog), so the release date decides nothing between them. The dragon's line
    // says its printing and its edition.
    await flow.getByRole('button', { name: 'Paste the text of the file instead' }).click();
    await flow
      .getByLabel('Text of the CSV export')
      .fill(
        [
          'Product Name,Card Number,Variance,Card Condition,Quantity',
          'Mirrorblade Knight,,,Lightly Played,1',
          'Azure-Eyes Sky Dragon,AZR-EN001,1st Edition,Near Mint,1',
          'Obsidian Magician Adept,,,Near Mint,2',
          '',
        ].join('\n')
      );
    await flow.getByRole('button', { name: 'Use this text' }).click();
    await expect(flow.getByRole('radio', { name: 'Which copy? 2' })).toBeVisible({
      timeout: 30_000,
    });
    const bar = flow.getByTestId('import-filter-bar');
    await expect(bar.getByRole('radio')).toHaveCount(3);
    await expect(flow.getByTestId('import-assumed')).toHaveCount(0);

    // The bulk action takes the plain copy of both, and says so once, in a snackbar.
    await flow.getByRole('button', { name: 'Use the newest' }).click();
    await expect(snackbar(page)).toHaveText(
      '2 lines got their most recent printing. Their most recent set has several versions: the plain copy (Unlimited, no foil) was taken. Check them.',
      { timeout: 30_000 }
    );
    await expect(snackbar(page)).toHaveCount(0, { timeout: 30_000 });

    // The snackbar is gone: the lines are still counted, on a card and on the pinned filter.
    const card = flow.getByTestId('import-assumed');
    await expect(card).toContainText('Plain copy assumed for 2 lines');
    const chip = '2 assumed: the lines whose plain copy was assumed';
    await expect(bar.getByRole('radio', { name: chip, exact: true })).toBeVisible();

    // The card's button lists them, and only them: the API is asked for exactly those rows.
    const listed = page.waitForRequest((asked) => {
      const url = new URL(asked.url());
      return (
        url.pathname.endsWith('/rows') &&
        url.searchParams.get('printingChoice') === 'MOST_RECENT_ASSUMED'
      );
    });
    await card.getByRole('button', { name: 'Show these 2 lines' }).click();
    expect(new URL((await listed).url()).searchParams.has('status')).toBe(false);
    await expect(bar.getByRole('radio', { name: chip, exact: true })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    // The line says so under its name (stage R14).
    await expect(flow.getByTestId('import-row-0-line')).toContainText('· assumed plain copy', {
      timeout: 30_000,
    });
    await expect(flow.getByTestId('import-row-2-line')).toContainText('· assumed plain copy');
    await expect(flow.getByTestId('import-row-1')).toHaveCount(0);

    // The knight's plain copy is right: picked again it is the collector's choice, the line
    // leaves the list and the count goes down.
    await flow.getByTestId('import-row-0-printing').click();
    const sheet = page.getByTestId('import-printing-sheet');
    await expect(sheet.getByTestId('import-printing-card')).toHaveText('Mirrorblade Knight');
    await sheet.getByRole('radio', { checked: true }).click();
    const one = '1 assumed: the line whose plain copy was assumed';
    await expect(bar.getByRole('radio', { name: one, exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(flow.getByTestId('import-row-0')).toHaveCount(0);
    await expect(card).toContainText('Plain copy assumed for 1 line');

    // The magician is the 1st Edition: changed, and nothing is left to check.
    await flow.getByTestId('import-row-2-printing').click();
    await expect(sheet.getByTestId('import-printing-card')).toHaveText('Obsidian Magician Adept');
    await sheet.getByRole('radio', { checked: false }).click();
    await expect(flow.getByText('No plain copy left to check')).toBeVisible({ timeout: 30_000 });
    await expect(flow.getByTestId('import-assumed')).toHaveCount(0);
    await flow.getByRole('button', { name: 'Show all lines' }).click();
    await expect(flow.getByTestId('import-row-1')).toBeVisible({ timeout: 30_000 });
    await expect(bar.getByRole('radio')).toHaveCount(3);

    // The import goes in with the copies the collector confirmed and chose.
    await flow.getByTestId('import-commit').click();
    await expect(
      flow.getByTestId('import-result').getByTestId('import-result-added')
    ).toContainText('3new cards added', { timeout: 30_000 });
    const held = await items(request, collector.idToken);
    expect(
      held
        .map((item) => `${item.card.name}|${item.edition}|${item.quantity}|${item.visibility}`)
        .sort()
    ).toEqual([
      'Azure-Eyes Sky Dragon|FIRST_EDITION|1|PRIVATE',
      'Mirrorblade Knight|UNLIMITED|1|PRIVATE',
      'Obsidian Magician Adept|FIRST_EDITION|2|PRIVATE',
    ]);
  });

  test('an import left open is picked up again, and discarded only after a question', async ({
    page,
    request,
  }) => {
    test.setTimeout(180_000);
    const collector = await createOnboardedCollector(request, 'resume', 'Mobile Resumer');
    const flow = await openImport(page, collector, 'deck');
    await flow.getByRole('button', { name: 'Paste the text of the file instead' }).click();
    await flow.getByLabel('Text of the deck file').fill(DECK);
    await flow.getByRole('button', { name: 'Use this text' }).click();
    await expect(flow.getByRole('radio', { name: 'Which copy? 2' })).toBeVisible({
      timeout: 30_000,
    });
    // A choice made in the preview: the extra deck (the alternate artwork) does not count.
    await flow.getByRole('switch', { name: 'Extra deck' }).click();
    await expect(flow.getByTestId('import-summary-sentence')).toHaveText(
      'Your file lists 4 different cards. 1 is ready to add: 2 copies. 1 left out.',
      { timeout: 30_000 }
    );
    await expect(flow.getByRole('radio', { name: 'Which copy? 1' })).toBeVisible();

    // Leaving asks first: nothing was added, and the preview is kept.
    const back = flow.getByTestId('BackButton');
    await back.click();
    const leave = page.getByTestId('import-leave-dialog');
    await expect(leave).toContainText('Leave this import?');
    await expect(leave).toContainText('Nothing has been added to your inventory yet.');
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(flow.getByTestId('import-summary')).toBeVisible();
    await back.click();
    await page.getByTestId('import-leave-dialog').getByRole('button', { name: 'Leave' }).click();

    // Opened again later (back on Add cards): the import is offered first, with its choices.
    await pickSource(page, 'deck');
    const again = screen(page, 'import');
    const open = again.getByTestId('import-open');
    await expect(open).toContainText('Continue your import', { timeout: 30_000 });
    await expect(open).toContainText('Deck file · 4 different cards · kept until');
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
    await expect(dialog).toContainText('Nothing was added to your inventory yet.');
    await dialog.getByRole('button', { name: 'Keep checking' }).click();
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
