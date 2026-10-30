import { APIRequestContext, expect, test } from '@playwright/test';
import {
  apiCreateItem,
  apiUpdatePrivacy,
  printingIdOf,
  watchCoordinates,
} from './support/inventory';
import {
  API_URL,
  authHeader,
  chooseOption,
  createOnboardedCollector,
  requireStack,
  signInThroughUi,
  stubCardImages,
} from './support/stack';

/**
 * Web stage WE (boards W1, W2, W23 to W25) against the real local stack: Home's feed with its
 * chips, "I have it" and Get started; the bell's popover and `/notifications` without chats, with
 * Mark all as read; Settings › Location edited, with "Show me on the map" answered in place. The
 * seed's Yu-Gi-Oh! feed of Americas (North) is dated relative to the API's start (R7).
 */
test.describe('web stage WE: Home, notifications and settings', () => {
  requireStack();

  test.beforeEach(async ({ page }) => {
    await stubCardImages(page);
  });

  test("Home's chips, the end of the feed, I have it's draft and Get started", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const viewer = await createOnboardedCollector(request, 'homewe', { location: true });
    const watcher = watchCoordinates(page);
    await signInThroughUi(page, viewer.email, viewer.password);
    await page.goto('/?game=yugioh');
    await expect(page).toHaveURL(/region=americas-north/);
    await expect(page).toHaveURL(/game=yugioh/);
    await expect(page.getByRole('heading', { level: 1, name: 'What’s new' })).toBeVisible();
    await expect(page.locator('.home__scope')).toContainText(
      'Yu-Gi-Oh! · Americas (North) · last 30 days',
    );
    const posts = page.getByTestId('feed-post');
    await expect(posts.first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('home-updated')).toHaveText('Updated just now');

    // The chips filter the feed and live in the URL (spec 4.11).
    const show = page.getByRole('group', { name: 'Show' });
    await show.getByRole('button', { name: 'Wanted' }).click();
    await expect(page).toHaveURL(/kind=wanted/);
    await expect(show.getByRole('button', { name: 'Wanted' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(posts.first()).toContainText('wants a card');
    for (const text of await posts.locator('.fp__verb').allInnerTexts()) {
      expect(text.trim()).toBe('wants a card');
    }
    await show.getByRole('button', { name: 'Deck cores' }).click();
    await expect(page).toHaveURL(/kind=deckcores/);
    await expect(page.getByTestId('feed-deck-core').first()).toBeVisible();
    await show.getByRole('button', { name: 'New cards' }).click();
    await expect(page).toHaveURL(/kind=cards/);
    await expect(posts.first().locator('.fp__verb')).toContainText('listed');
    await show.getByRole('button', { name: 'All' }).click();
    await expect(page).not.toHaveURL(/kind=/);

    // The end of the feed (the seed's window holds less than one page).
    await expect(page.getByTestId('home-end')).toContainText('You’re all caught up');
    await expect(page.getByTestId('home-end')).toContainText(
      'That’s everything new for Yu-Gi-Oh! in Americas (North) from the last 30 days.',
    );
    // No count of posts anywhere (owner 2026-10-14), no "Your desk" (decision 16).
    await expect(page.locator('.home__toolbar')).not.toContainText(/\d+ posts?/);
    await expect(page.getByRole('main')).not.toContainText(/Your desk|\bkm\b/);

    // Shift+Tab back up the feed: a focused post control stops below the sticky toolbar, never
    // under it (SC 2.4.11, WE review A1).
    await page.getByTestId('home-end').getByRole('link', { name: 'Explore the map' }).focus();
    for (let step = 0; step < 10; step++) {
      await page.keyboard.press('Shift+Tab');
      const spot = await page.evaluate(() => {
        const focused = document.activeElement as HTMLElement;
        const toolbar = document.querySelector('.home__toolbar')!.getBoundingClientRect();
        return {
          inFeed: !!focused.closest('.home__list'),
          top: focused.getBoundingClientRect().top,
          toolbarBottom: toolbar.bottom,
        };
      });
      if (spot.inFeed) {
        expect(spot.top, `step ${step}: under the toolbar`).toBeGreaterThanOrEqual(
          spot.toolbarBottom - 1,
        );
      }
    }

    // "I have it" opens the chat drawer to the wisher with the draft, nothing sent.
    const wish = posts.filter({ hasText: 'wants a card' }).first();
    const card = (await wish.locator('.fp__name').innerText()).trim();
    await wish.getByTestId('feed-have-it').click();
    const drawer = page.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('textbox', { name: 'Message' })).toHaveValue(
      `Hi! I have ${card}.`,
    );
    await page.keyboard.press('Escape');

    // Get started (the viewer has no public card and no wish): hidden for good once closed.
    const steps = page.getByTestId('get-started');
    await expect(steps).toContainText('of 3');
    await expect(steps.getByRole('link', { name: 'Add cards' })).toHaveAttribute(
      'href',
      '/inventory?add=new',
    );
    await steps.getByRole('button', { name: 'Hide these steps' }).click();
    await expect(steps).toHaveCount(0);
    await page.reload();
    await expect(posts.first()).toBeVisible();
    await expect(page.getByTestId('get-started')).toHaveCount(0);
    // The map card: a static picture of the region, the viewer's province named.
    await expect(page.getByTestId('home-map-card')).toContainText('Quebec · your province');
    await expect(page.locator('.leaflet-container')).toHaveCount(0);

    await watcher.settle();
    expect(watcher.samples, 'lat/lng in a JSON answer').toEqual([]);
  });

  test("the mouse wheel over Home's rail scrolls the rail, then the page (WE review R1-1)", async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    // Get started over the map card: at 1440x900 the rail is taller than the window (F4).
    const viewer = await createOnboardedCollector(request, 'homewheel', { location: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughUi(page, viewer.email, viewer.password);
    await page.goto('/?region=americas-north&game=yugioh');
    await expect(page.getByTestId('feed-post').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('get-started')).toBeVisible();
    const rail = page.locator('.home__rail');
    const heading = page.getByRole('heading', { level: 1, name: 'What’s new' });
    const headingTop = async (): Promise<number> => (await heading.boundingBox())!.y;
    const before = await headingTop();
    const box = (await rail.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 300));
    for (let turn = 0; turn < 6; turn++) {
      await page.mouse.wheel(0, 300);
    }
    // The page moves under the pointer (the rail never keeps the wheel to itself), and a rail
    // taller than the window was scrolled to its end first.
    await expect.poll(headingTop, { timeout: 10_000 }).toBeLessThan(before - 300);
    const end = await rail.evaluate((el) => ({
      overflows: el.scrollHeight > el.clientHeight + 1,
      atEnd: el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    }));
    if (end.overflows) {
      expect(end.atEnd, 'the rail scrolled to its end first').toBe(true);
    }
  });

  test('the bell and /notifications leave chats out; Mark all as read empties the dot', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seller = await createOnboardedCollector(request, 'bellseller', { location: true });
    const viewer = await createOnboardedCollector(request, 'bellviewer', { location: true });
    await apiUpdatePrivacy(request, seller.idToken, { discoverable: true });
    const printingId = await printingIdOf(request, viewer.idToken, 'AZR-EN001');
    await postJson(request, viewer.idToken, '/api/v1/wishlist', { printingId }, 201);
    // A chat message: its notice is the viewer's, but the bell never shows chats (R9).
    const chat = await postJson(request, seller.idToken, '/api/v1/conversations', {
      recipientId: viewer.id,
    });
    await postJson(
      request,
      seller.idToken,
      `/api/v1/conversations/${chat['id']}/messages`,
      { kind: 'TEXT', body: 'Hello from an E2E chat' },
      201,
    );
    await apiCreateItem(request, seller.idToken, {
      printingId,
      quantity: 1,
      condition: 'NEAR_MINT',
      availability: 'SALE',
      askingPrice: 12,
      visibility: 'PUBLIC',
    });

    await signInThroughUi(page, viewer.email, viewer.password);
    const bell = page.getByTestId('notification-bell');
    // Other suites list the same card in the same region at the same time: at least this alert.
    await expect(bell).toHaveAccessibleName(/^Notifications, [1-9]\d* new$/, { timeout: 30_000 });
    // The keyboard (WE review F1, A2): Enter opens the popover with the focus in it, Tab never
    // leaves it, Esc closes it with the focus back on the bell.
    const popover = page.getByTestId('notification-popover');
    await bell.focus();
    await page.keyboard.press('Enter');
    await expect(popover).toBeFocused();
    await expect(popover.getByTestId('notification-row').first()).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(popover.getByTestId('bell-mark-all')).toBeFocused();
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press(step % 4 === 3 ? 'Shift+Tab' : 'Tab');
      expect(
        await popover.evaluate((dialog) => dialog.contains(document.activeElement)),
        `step ${step}: the focus is in the popover`,
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expect(bell).toBeFocused();
    await bell.click();
    await expect(popover.getByRole('heading', { name: 'New' })).toBeVisible();
    const row = popover.getByTestId('notification-row').filter({ hasText: seller.handle });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('from your wishlist was listed in Quebec');
    await expect(popover).not.toContainText(/New message|Hello from an E2E chat/);
    await popover.getByTestId('bell-mark-all').click();
    await expect(page.getByTestId('notification-badge')).toHaveCount(0);
    await expect(bell).toHaveAccessibleName('Notifications');
    await popover.getByTestId('bell-see-all').click();

    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Chats are in');
    const today = page.getByRole('list', { name: 'Today notifications' });
    await expect(today.getByRole('listitem').filter({ hasText: seller.handle })).toHaveCount(1);
    await expect(today).not.toContainText('New message');
    await page.getByRole('radio', { name: /^Unread/ }).click();
    await expect(page).toHaveURL(/unread=1/);
    await expect(
      page.getByText('You’re all caught up').or(page.getByText("You're all caught up")),
    ).toBeVisible();
  });

  test('Settings › Location: "Show me on the map" answered in place, then the place edited', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const collector = await createOnboardedCollector(request, 'locwe');
    await signInThroughUi(page, collector.email, collector.password);
    await page.goto('/settings/location');
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toContainText(
      'Where you ship from',
    );
    const onMap = page.getByRole('switch', { name: 'Show me on the map' });
    await onMap.click();
    await expect(
      page.getByText('Choose your country and your state or province first, then turn this on.'),
    ).toBeVisible();
    await expect(onMap).toHaveAttribute('aria-checked', 'false');

    await chooseOption(page, 'Country', 'Canada');
    await chooseOption(page, 'State or province', 'Quebec');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByTestId('location-save').click();
    await expect(page.getByTestId('location-label')).toHaveText(/Quebec, Canada/);
    await expect(page.getByText('No changes yet')).toBeVisible();
    await onMap.click();
    await expect(onMap).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('location-discoverable')).toContainText(
      'Collectors see you in Quebec, Canada.',
    );
    const others = page.getByRole('list', { name: 'What others see' });
    await expect(others).toContainText(collector.handle);
    await expect(others).toContainText('A collector');
    await expect(page.getByRole('button', { name: 'Remove my location' })).toBeVisible();
    // The nav line follows (spec 13).
    await expect(page.getByRole('navigation', { name: 'Settings sections' })).toContainText(
      'Quebec, Canada · On the map',
    );
  });
});

async function postJson(
  request: APIRequestContext,
  token: string,
  path: string,
  data: Record<string, unknown>,
  status?: number,
): Promise<Record<string, unknown>> {
  const response = await request.post(`${API_URL}${path}`, { headers: authHeader(token), data });
  if (status) {
    expect(response.status(), `POST ${path}`).toBe(status);
  } else {
    expect(response.ok(), `POST ${path}`).toBeTruthy();
  }
  return response.json();
}
