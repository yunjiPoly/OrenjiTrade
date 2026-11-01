import { expect, test } from './support/fixtures';
import {
  PLACES,
  apiAddItem,
  apiAddWish,
  apiConversation,
  apiDeckCore,
  apiListItem,
  apiMessages,
  apiPublicBinder,
  apiStartConversationAbout,
  apiUpdatePrivacy,
  cardOfPrinting,
  createOnboardedCollector,
  openInApp,
  openTab,
  requireStack,
  screen,
  signInThroughUi,
} from './support/stack';

const suffix = () => Math.random().toString(36).slice(2, 6);

/**
 * Stage R6 of the phone redesign (owner spec 2026-10-14, sections 9 and 10; mockup screens 19 to
 * 21) against the real stack: another collector's profile (the header, the one line, "Message",
 * Cards, Binders with a deck core, Looking for with "I have it", About, Ratings & references, the
 * "See all" pages), "I have it" opening the chat with your card and the text in the box, nothing
 * sent and the chat's card unchanged before send; your Profile tab with the gear that opens Settings.
 */
test.describe('mobile profiles (stage R6)', () => {
  requireStack();

  test("another collector's profile: the sections, See all, and I have it", async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    const dana = await createOnboardedCollector(request, 'pdana', `Dana Profile ${suffix()}`, {
      location: { ...PLACES.quebec, city: 'Laval', showCity: true },
      discoverable: true,
    });
    const viewer = await createOnboardedCollector(request, 'pview', `Vic Viewer ${suffix()}`, {
      location: PLACES.ontario,
      discoverable: true,
    });
    const { cardId, printingId, cardName } = await cardOfPrinting(request, dana.idToken, 'PFT-002');
    const binderId = await apiPublicBinder(request, dana, 'Profile binder');
    const listed = await apiListItem(request, dana, binderId, printingId, {
      askingPriceText: '85% TCG',
    });
    await apiDeckCore(request, dana, 'Profile core', '$95', printingId);
    await apiAddWish(request, dana, cardId, { priceTerm: '90% TCG' });
    await apiUpdatePrivacy(request, dana.idToken, { wishlistVisible: true });
    // The viewer holds the card Dana wants.
    const mine = await apiAddItem(request, viewer, printingId, {
      visibility: 'PUBLIC',
      askingPriceText: '$12.50',
    });
    // The viewer asked Dana about her card before: their chat is pinned on it (R4).
    const earlier = await apiStartConversationAbout(request, viewer, dana.id, {
      subjectItemId: listed.id,
    });

    await signInThroughUi(page, viewer.email, viewer.password);
    await openInApp(page, `/collectors/${dana.handle}`);
    const profile = screen(page, 'collector');
    await expect(profile.getByTestId('collector-name')).toHaveText(dana.displayName, {
      timeout: 30_000,
    });
    // The city only on its owner's profile, the province without the country, this week.
    await expect(profile.getByTestId('collector-line')).toHaveText(
      /^Laval, Quebec · Member since \d{4} · Active this week$/
    );
    await expect(profile.getByTestId('collector-chips')).toContainText('Pokémon');
    await expect(profile.getByTestId('collector-message')).toContainText(`Message ${dana.handle}`);
    await expect(profile.getByTestId(`profile-card-${listed.id}`)).toContainText('85% TCG', {
      timeout: 30_000,
    });
    await expect(profile.getByTestId('profile-binders')).toContainText('Profile core');
    await expect(profile.getByTestId('profile-binders')).toContainText('$95');
    await expect(profile.getByTestId('profile-wishes')).toContainText(
      'Any printing · NM only · 90% TCG'
    );
    await expect(profile.getByTestId('profile-bio-text')).toHaveText(
      'Fictional mobile E2E collector.'
    );
    await expect(profile.getByTestId('profile-ratings-empty')).toHaveText('No ratings yet.');
    await expect(profile).not.toContainText(/\bkm\b|Canada/);

    // "See all" of the cards: every public card, a card opens Who has this card.
    await profile.getByRole('link', { name: 'See all cards' }).click();
    await expect(page.getByTestId(`collector-all-card-${listed.id}`)).toContainText('85% TCG', {
      timeout: 30_000,
    });
    await page.goBack();

    // "I have it": the same chat opens with your card and the text in the box. Nothing is sent
    // and the chat's card stays Dana's until send: she sees no copy of yours before that.
    await profile.getByTestId(`profile-have-${cardId}`).click();
    const chat = screen(page, 'conversation');
    const box = chat.getByLabel('Message', { exact: true });
    await expect(box).toHaveValue(`I have ${cardName} for your wishlist. Interested?`, {
      timeout: 30_000,
    });
    await expect(chat.getByTestId('composer-attachment')).toContainText(cardName);
    const conversationId = page.url().split('/messages/')[1]?.split(/[?#]/)[0] ?? '';
    expect(conversationId).toBe(earlier);
    expect((await apiConversation(request, dana, conversationId)).subject?.id).toBe(listed.id);
    expect(await apiMessages(request, dana, conversationId)).toEqual([]);

    // Send: your card first, then the text, as Dana reads it.
    await chat.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(async () =>
        (await apiMessages(request, dana, conversationId)).map((message) => [
          message.kind,
          message.body,
        ])
      )
      .toEqual([['CARD_LINK', `I have ${cardName} for your wishlist. Interested?`]]);
    // Sent, your copy is the chat's card: you are the seller.
    expect((await apiConversation(request, dana, conversationId)).subject?.id).toBe(mine.id);
    await expect(chat.getByTestId('pinned-line')).toContainText('your card', { timeout: 30_000 });
  });

  test('your Profile tab: your page, and the gear opens Settings', async ({ page, request }) => {
    test.setTimeout(150_000);
    const sam = await createOnboardedCollector(request, 'psam', `Sam Tab ${suffix()}`, {
      location: { ...PLACES.quebec, city: 'Montréal', showCity: true },
      discoverable: true,
    });
    await signInThroughUi(page, sam.email, sam.password);
    await openTab(page, 'Profile');
    const profile = screen(page, 'profile');
    await expect(profile.getByTestId('profile-name')).toHaveText(sam.displayName, {
      timeout: 30_000,
    });
    // Your own line: your shown city and the province; no activity (you are here).
    await expect(profile.getByTestId('profile-line')).toHaveText(
      /^Montréal, Quebec · Member since \d{4}$/
    );
    await expect(profile.getByRole('button', { name: 'Edit profile' })).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Share profile' })).toBeVisible();
    await expect(profile.getByTestId('collector-message')).toHaveCount(0);
    await expect(profile.getByTestId('profile-cards-empty')).toContainText(
      'Make cards public in Inventory'
    );

    // "See all" of your cards is your Inventory.
    await profile.getByRole('link', { name: 'See all cards' }).click();
    await expect(screen(page, 'inventory')).toBeVisible({ timeout: 30_000 });
    await openTab(page, 'Profile');

    // The gear: Settings, with everything the Profile tab reached before.
    await profile.getByRole('button', { name: 'Settings' }).click();
    const settings = screen(page, 'settings');
    // Stage R13: the profile card opens Edit profile; the groups of mockup v50 screen 47.
    await expect(settings.getByTestId('settings-link-profile')).toBeVisible({ timeout: 30_000 });
    for (const name of [
      'Location and discoverability',
      'Privacy',
      'Shipping details',
      'Notifications',
      'Blocked collectors',
      'My reports',
      'Account',
      'Appearance',
      'Legal',
    ]) {
      await expect(settings.getByRole('link', { name, exact: true })).toBeVisible({
        timeout: 30_000,
      });
    }
    await expect(settings.getByRole('button', { name: 'Sign out' })).toBeVisible();
    // Nothing paid, no offers or payouts (ADR 0018, ADR 0019).
    await expect(settings).not.toContainText(/Premium|Credits|Support OrenjiTrade|Offers|Payouts/);

    // Settings › Appearance credits the card data of the games that hold cards (stage R10): the
    // fictional catalogue holds Yu-Gi-Oh!, Pokémon and Magic cards.
    await settings.getByRole('link', { name: 'Appearance', exact: true }).click();
    const credits = screen(page, 'settings-appearance').getByTestId('card-data-credits');
    await expect(credits).toContainText(
      'Yu-Gi-Oh! card data from YGOPRODeck. Pokémon card data from TCGdex. Magic card data and ' +
        'images from Scryfall. Not affiliated with or endorsed by the game publishers.',
      { timeout: 30_000 }
    );
  });
});
