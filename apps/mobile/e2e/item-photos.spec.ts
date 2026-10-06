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
} from './support/stack';

/**
 * Owner photos on an inventory item (stage M7, the web's `app-item-photos` on
 * `POST` / `DELETE /inventory/items/{id}/images`): add one from the library (a file chooser on the
 * web build), refuse a file that is not a photo before any upload, remove it; the API holds each
 * step and serves the photo through its own media route.
 */
test.describe('mobile item photos', () => {
  requireStack();

  test('add a photo from the library, refuse a non-photo, remove it', async ({ page, request }) => {
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
    await expect(edit.getByTestId('edit-item-name')).toHaveText(item.card.name, {
      timeout: 30_000,
    });
    const photos = edit.getByTestId('item-photos');
    await expect(photos).toContainText('Up to 4 photos (JPEG, PNG or WebP, 8 MB).');
    await expect(photos.locator('[data-testid^="item-photo-"][data-testid$="-remove"]')).toHaveCount(
      0
    );

    // A text file is refused before any upload.
    let uploads = 0;
    page.on('request', (candidate) => {
      if (candidate.method() === 'POST' && candidate.url().includes('/images')) {
        uploads++;
      }
    });
    const wrong = page.waitForEvent('filechooser');
    await photos.getByRole('button', { name: 'Add photo' }).click();
    await (
      await wrong
    ).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
    await expect(photos.getByTestId('item-photo-error')).toHaveText('Use a JPEG, PNG or WebP photo.');
    expect(uploads).toBe(0);

    // A PNG from the library: uploaded, shown as a tile, held by the API.
    const upload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith(`/api/v1/inventory/items/${item.id}/images`)
    );
    const chooser = page.waitForEvent('filechooser');
    await photos.getByRole('button', { name: 'Add photo' }).click();
    await (
      await chooser
    ).setFiles({ name: 'sleeve.png', mimeType: 'image/png', buffer: PHOTO_PNG });
    expect((await upload).status()).toBe(201);
    await expect(photos.getByTestId('item-photo-error')).toHaveCount(0);
    const stored = await apiInventoryItem(request, owner, item.id);
    expect(stored.images).toHaveLength(1);
    const image = stored.images[0]!;
    // Served through the API's own media route (the app only ever shows API pictures).
    expect(image.url).toContain('/api/v1/public/media/');
    expect(image.url.startsWith('http') ? image.url.startsWith(API_URL) : true).toBe(true);
    const tile = photos.getByTestId(`item-photo-${image.id}`);
    await expect(tile).toBeVisible({ timeout: 30_000 });
    await expect(tile.getByRole('button', { name: 'Remove photo 1' })).toBeVisible();

    // Remove it.
    const removal = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().endsWith(`/api/v1/inventory/items/${item.id}/images/${image.id}`)
    );
    await tile.getByRole('button', { name: 'Remove photo 1' }).click();
    expect((await removal).status()).toBe(204);
    await expect(tile).toHaveCount(0);
    expect((await apiInventoryItem(request, owner, item.id)).images).toEqual([]);
    await expect(photos.getByRole('button', { name: 'Add photo' })).toBeVisible();
  });
});
