import { requireStack } from '../support/stack';
import { suffix } from './support/api';
import { dialogReady, expect, test } from './support/fixtures';
import { randomCentre } from './support/places';

/**
 * Acceptance — stale listings (spec § 60 rows 31–32): a collector's public card was last confirmed
 * 44 days ago (test clock), so the hourly freshness job (`/internal/jobs/freshness`, service
 * token) derives STALE from the active delist policy (default: STALE after 30 days, hidden after
 * 45) without deleting anything. An administrator finds it in the "Needs review" queue of the
 * admin console, restores it on the owner's behalf (the listing is fresh again) and finds the
 * `listing.restore` entry in the audit log.
 */

interface AdminListing {
  item: { id: string; cardName: string };
  owner: { id: string; handle: string };
  state: string;
}

test.describe('acceptance: stale listings', () => {
  requireStack();

  test('the freshness job flags an unconfirmed listing and an admin restores it from the review queue', async ({
    api,
    actors,
  }) => {
    test.setTimeout(150_000);
    const card = 'Frostbite Sorceress';
    const { collector: seller, items } = await api.seller(
      'acc-stale',
      randomCentre('staleListings'),
      [{ code: 'AZR-EN031', extra: { visibility: 'PUBLIC', askingPrice: 18 } }],
      { displayName: `Stan Stale ${suffix()}` },
    );
    const admin = await api.staff('acc-staleadmin', ['ADMIN']);
    const itemId = items[0]!.id;
    const listing = async (): Promise<AdminListing | undefined> => {
      const page = await api.ok<{ items: AdminListing[] }>('GET', '/api/v1/admin/listings', {
        token: admin.idToken,
        params: { ownerId: seller.id, size: 50 },
      });
      return page.items.find((entry) => entry.item.id === itemId);
    };
    expect((await listing())?.state).toBe('ACTIVE');

    // --- Test clock: the owner last confirmed the card 44 days ago; the hourly job runs --------
    api.backdateConfirmation(itemId, 44);
    const run = await api.runJob<{ itemsStaled: number }>('freshness');
    expect(run.itemsStaled).toBeGreaterThanOrEqual(1);
    expect((await listing())?.state, 'STALE, never deleted').toBe('STALE');

    // --- The admin reviews the stale listing and restores it ------------------------------------
    const page = await actors.open(admin);
    await page.goto('/admin/listings');
    await expect(page.getByRole('heading', { level: 1, name: 'Listings' })).toBeVisible();
    const queue = page.getByRole('list', { name: 'Listings to review' });
    const row = queue.locator(`[data-listing="${itemId}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(card);
    await expect(row).toContainText(`@${seller.handle}`);
    await expect(row).toContainText('Stale');
    await row.getByRole('button', { name: `Restore ${card} of @${seller.handle}` }).click();
    const dialog = await dialogReady(page.getByRole('dialog', { name: `Restore ${card}?` }));
    await dialog.getByRole('button', { name: 'Restore listing' }).click();
    await expect(page.getByText(`${card} is restored.`)).toBeVisible();
    await expect(queue.locator(`[data-listing="${itemId}"]`)).toHaveCount(0);
    expect((await listing())?.state, 'fresh again').toBe('ACTIVE');

    // --- The restore is in the audit log ---------------------------------------------------------
    await page.goto(`/admin/audit-logs?action=listing.restore&targetId=${itemId}`);
    const entries = page.getByRole('table', { name: 'Audit entries' });
    await expect(entries.getByText('Restored a listing').first()).toBeVisible({ timeout: 20_000 });
    await expect(entries.getByText(`@${admin.handle}`).first()).toBeVisible();
  });
});
