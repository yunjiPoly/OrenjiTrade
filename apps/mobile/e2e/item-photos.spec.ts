import { expect, test } from './support/fixtures';
import {
  API_URL,
  PHOTO_PNG,
  apiAddItem,
  apiInventoryItem,
  createOnboardedCollector,
  openTab,
  printingIdOf,
  requireStack,
  screen,
  signInThroughUi,
  snackbar,
} from './support/stack';

/**
 * The photos of Edit card (owner spec 2026-10-14, section 6, screen 7: saved with "Save changes"):
 * add one from the library (a file chooser on the web build), refuse a file that is not a photo
 * before any upload, save, then remove it and save again; the API holds each step and serves the
 * photo through its own media route.
 */
test.describe('mobile item photos', () => {
  requireStack();

  test('add a photo, refuse a non-photo, save, remove it and save', async ({ page, request }) => {
    test.setTimeout(150_000);
    const owner = await createOnboardedCollector(request, 'photo', 'Mobile Photographer');
    const item = await apiAddItem(
      request,
      owner,
      await printingIdOf(request, owner.idToken, 'PFT-002')
    );
    await signInThroughUi(page, owner.email, owner.password);

    await openTab(page, 'Inventory');
    await screen(page, 'inventory').getByTestId(`item-${item.id}`).click();
    const edit = screen(page, 'edit-item');
    await expect(edit.getByTestId('card-header-name')).toHaveText(item.card.name, {
      timeout: 30_000,
    });
    const photos = edit.getByTestId('card-photos');
    await expect(photos).toContainText(
      'Show the real card, front and back. Location data is removed.'
    );
    await expect(photos.getByTestId('card-photos-count')).toHaveText('0 / 4');

    // A text file is refused before any upload.
    let uploads = 0;
    page.on('request', (candidate) => {
      if (candidate.method() === 'POST' && candidate.url().includes('/images')) {
        uploads++;
      }
    });
    const wrong = page.waitForEvent('filechooser');
    await photos.getByRole('button', { name: 'Add photos' }).click();
    await (
      await wrong
    ).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
    await expect(photos.getByTestId('card-photos-problem')).toHaveText(
      'Use a JPEG, PNG or WebP photo.'
    );
    expect(uploads).toBe(0);

    // A PNG from the library: a tile at once, uploaded with "Save changes".
    const chooser = page.waitForEvent('filechooser');
    await photos.getByRole('button', { name: 'Add photos' }).click();
    await (
      await chooser
    ).setFiles({ name: 'sleeve.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    await expect(photos.getByTestId('card-photos-count')).toHaveText('1 / 4');
    expect(uploads).toBe(0);
    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/v1/inventory/items/${item.id}/images`)
    );
    await edit.getByRole('button', { name: 'Save changes' }).click();
    expect((await upload).status()).toBe(201);
    await expect(snackbar(page)).toContainText('Saved', { timeout: 30_000 });
    const stored = await apiInventoryItem(request, owner, item.id);
    expect(stored.images).toHaveLength(1);
    const image = stored.images[0]!;
    // Served through the API's own photo route, by the photo's id: never the owner's account id
    // (the app only ever shows API pictures; stage R15, review fix 1).
    expect(image.url).toContain(`/api/v1/public/item-images/${image.id}`);
    expect(image.url).not.toContain(owner.id);
    expect(image.url.startsWith('http') ? image.url.startsWith(API_URL) : true).toBe(true);

    // Remove it: gone from the form at once, from the API with "Save changes".
    await screen(page, 'inventory').getByTestId(`item-${item.id}`).click();
    const again = screen(page, 'edit-item');
    const tiles = again.getByTestId('card-photos');
    await expect(tiles.getByTestId('card-photos-count')).toHaveText('1 / 4', { timeout: 30_000 });
    await tiles.getByRole('button', { name: 'Remove photo 1' }).click();
    await expect(tiles.getByTestId('card-photos-count')).toHaveText('0 / 4');
    const removal = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().endsWith(`/api/v1/inventory/items/${item.id}/images/${image.id}`)
    );
    await again.getByRole('button', { name: 'Save changes' }).click();
    expect((await removal).status()).toBe(204);
    await expect(snackbar(page)).toContainText('Saved', { timeout: 30_000 });
    expect((await apiInventoryItem(request, owner, item.id)).images).toEqual([]);
  });
});
