import { expect, test } from '@playwright/test';
import {
  API_URL,
  TEST_PASSWORD,
  apiMe,
  authHeader,
  chooseOption,
  createOnboardedCollector,
  emulatorSignIn,
  forbidMapProviders,
  requireStack,
  stubCardImages,
  uniqueEmail,
  uniqueHandle,
  verifyEmailInEmulator,
} from './support/stack';

/**
 * Launch readiness (2026-10-05) against the real local E2E stack: a visitor signs up with the
 * 18+ checkbox, becomes discoverable from the onboarding flow, opens a first conversation from a
 * collector profile (the chat drawer, then Messages) and reads the chat's shield tip (web stage WC:
 * the dismissible notice of 2026-10-05 became the tip, with Report and Block in the chat's menu),
 * then the Trading safely page, and can block / unblock from the profile. A second test
 * reads the legal pages in French (French browser, EN/FR switch, `?lang=`) and in English.
 */
test.describe('launch readiness: trading safety and French legal pages', () => {
  requireStack();

  test('sign up with the 18+ checkbox, become discoverable, read the chat safety tip in a first conversation', async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const other = await createOnboardedCollector(request, 'safeb', {
      displayName: `Bea Safe ${Math.random().toString(36).slice(2, 6)}`,
    });
    const email = uniqueEmail('safety');
    const handle = uniqueHandle('safe');
    await forbidMapProviders(page);
    await stubCardImages(page);

    // --- Sign up: the 18+ checkbox is explicit and unticked ---------------------------------
    await page.goto('/auth/sign-up');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole('checkbox', { name: 'Accept all' }).check();
    const ageBox = page.getByRole('checkbox', { name: /I confirm I am 18 years of age or older/ });
    await expect(ageBox).not.toBeChecked();
    await ageBox.check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/auth\/verify-email/, { timeout: 20_000 });
    await verifyEmailInEmulator(request, email);
    await page.getByRole('button', { name: 'I have verified my email' }).click();

    // --- Onboarding: profile, interests, location with "Show me on the map" ---------------------
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
    await page.getByLabel('Handle').fill(handle);
    await page.getByLabel('Display name').fill('E2E Safety Tester');
    const next = page.getByRole('button', { name: 'Continue', exact: true });
    await next.filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: 'What do you collect?' })).toBeVisible();
    await page
      .getByRole('group', { name: 'Games you collect or play' })
      .getByRole('button', { name: 'Pokémon' })
      .click();
    await next.filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: 'Where are you?' })).toBeVisible();
    await chooseOption(page, 'Country', 'Canada');
    await chooseOption(page, 'State or province', 'Quebec');
    await page.getByRole('switch', { name: 'Show me on the map' }).click();
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/:\d+\/(\?region=[a-z-]+(&game=[a-z-]+)?)?$/, { timeout: 20_000 });
    await expect(page.getByText('Welcome to OrenjiTrade! Your profile is ready.')).toBeVisible();

    // The API confirms the account is discoverable (the age gate let the switch through) and
    // recorded the 18+ confirmation and the terms in the language the pages were shown in.
    const token = await emulatorSignIn(request, email, TEST_PASSWORD);
    const location = await request.get(`${API_URL}/api/v1/me/location`, {
      headers: authHeader(token),
    });
    expect(location.ok()).toBeTruthy();
    expect(((await location.json()) as { discoverable: boolean }).discoverable).toBe(true);
    const exported = await request.get(`${API_URL}/api/v1/me/export`, {
      headers: authHeader(token),
    });
    expect(exported.ok(), 'GET /me/export').toBeTruthy();
    const consents = (
      (await exported.json()) as {
        sections: { account: { consents: { documentType: string; language?: string }[] } };
      }
    ).sections.account.consents;
    expect(consents.map((c) => c.documentType)).toEqual(
      expect.arrayContaining(['TERMS', 'PRIVACY', 'AGE_CONFIRMATION']),
    );
    expect(new Set(consents.map((c) => c.language))).toEqual(new Set(['en']));

    // --- First conversation from the collector profile: the chat's safety words -------------
    // Web stage WC (spec 10.3, 10.4 and 20): the dismissible notice became the shield tip of the
    // chat, Trading safely beside a buyer's chat, and Report / Block in the "⋯" menu.
    await page.goto(`/collectors/${other.handle}`);
    await expect(page.getByRole('heading', { level: 1, name: other.displayName })).toBeVisible();
    await page.getByRole('button', { name: `Message ${other.handle}` }).click();
    const drawer = page.getByTestId('chat-drawer');
    await expect(drawer).toBeVisible();
    await drawer.getByTestId('open-in-messages').click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    const thread = page.getByRole('region', { name: `Chat with ${other.handle}` });
    const tip = thread.getByTestId('chat-tip');
    await expect(tip).toBeVisible();
    // The phone's words (ADR 0018: shipped by mail, e-Transfer outside the app; no meetups).
    await expect(tip).toContainText('OrenjiTrade never holds the money.');
    await expect(tip).not.toContainText(/meet|public place/i);

    // Report and Block are in the chat's menu; both dialogs can be cancelled.
    await thread.getByRole('button', { name: `More for ${other.handle}` }).click();
    await page.getByRole('menuitem', { name: `Report ${other.handle}` }).click();
    const report = page.getByRole('dialog', { name: /^Report / });
    await expect(report).toBeVisible();
    await report.getByRole('button', { name: 'Cancel' }).click();
    await expect(report).toBeHidden();
    await thread.getByRole('button', { name: `More for ${other.handle}` }).click();
    await page.getByRole('menuitem', { name: `Block ${other.handle}` }).click();
    const confirm = page.getByRole('dialog', { name: `Block ${other.handle}?` });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toBeHidden();

    // The tip never blocks messaging.
    const composer = thread.getByRole('textbox', { name: 'Message' });
    await composer.fill('Hi! Do you ship with tracking?');
    await composer.press('Enter');
    await expect(thread.getByRole('log', { name: `Messages with ${other.handle}` })).toContainText(
      'Do you ship with tracking?',
    );
    await expect(composer).toHaveValue('');

    // The link lands on the Trading safely page (English browser: English text).
    await page.goto('/legal/trading-safely');
    await expect(page.getByRole('heading', { level: 1, name: 'Trading safely' })).toBeVisible();
    await expect(page.getByText('the cards ship by mail')).toBeVisible();

    // --- Block and unblock from the collector profile ----------------------------------------
    // Web stage WE (board W23): Report and Block in the profile's "⋯" menu, named by the handle.
    await page.goto(`/collectors/${other.handle}`);
    await page.getByRole('button', { name: `More for ${other.handle}` }).click();
    await page.getByRole('menuitem', { name: `Block ${other.handle}` }).click();
    await page
      .getByRole('dialog', { name: `Block ${other.handle}?` })
      .getByRole('button', { name: 'Block' })
      .click();
    await expect(page.getByText(`You blocked ${other.handle}.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unblock' })).toBeVisible();
    const me = await apiMe(request, token);
    const refused = await request.post(`${API_URL}/api/v1/conversations`, {
      headers: authHeader(other.idToken),
      data: { recipientId: me.id },
    });
    expect(refused.status()).toBe(403);
    await page.getByRole('button', { name: 'Unblock' }).click();
    await expect(page.getByText(`${other.handle} is unblocked.`)).toBeVisible();
    await expect(page.getByText(`You blocked ${other.handle}.`)).toHaveCount(0);
    await page.getByRole('button', { name: `More for ${other.handle}` }).click();
    await expect(page.getByRole('menuitem', { name: `Block ${other.handle}` })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('legal pages in French for a French browser, with the EN/FR switch, and in English otherwise', async ({
    browser,
    page,
  }) => {
    test.setTimeout(90_000);
    // --- A French browser reads the French translation by default ----------------------------
    const french = await (await browser.newContext({ locale: 'fr-CA' })).newPage();
    await french.goto('/legal/terms');
    await expect(
      french.getByRole('heading', { level: 1, name: 'Conditions d’utilisation' }),
    ).toBeVisible();
    await expect(french.locator('article.legal')).toHaveAttribute('lang', 'fr');
    const banner = french.locator('app-legal-draft-banner [role="status"]').first();
    await expect(banner).toContainText('Ébauche');
    await expect(french.getByTestId('legal-translation-notice')).toContainText('Traduction');
    await expect(french.getByText('18 ans ou plus').first()).toBeVisible();
    await expect(french.getByText('Dans la mesure permise par la loi').first()).toBeVisible();

    // The switch flips to English and the choice is remembered on the next page.
    const toggle = french.getByTestId('legal-language-switch');
    await toggle.locator('button').filter({ hasText: 'EN' }).click();
    await expect(french.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(french.getByTestId('legal-translation-notice')).toHaveCount(0);
    await french.goto('/legal/privacy');
    await expect(french.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
    await expect(french.getByText('Confidentiality incidents').first()).toBeVisible();

    // `?lang=fr` selects French again (deep links), including on the new page and the index.
    await french.goto('/legal/trading-safely?lang=fr');
    await expect(
      french.getByRole('heading', { level: 1, name: 'Échanger en toute sécurité' }),
    ).toBeVisible();
    await expect(
      french.getByText('Vous concluez la transaction dans la conversation'),
    ).toBeVisible();
    await expect(french.getByText('Signaler et bloquer').first()).toBeVisible();
    await french.goto('/legal');
    await expect(french.getByRole('heading', { level: 1, name: 'Mentions légales' })).toBeVisible();
    await expect(french.getByRole('link', { name: /Politique de confidentialité/ })).toBeVisible();
    await expect(french.getByRole('link', { name: /Échanger en toute sécurité/ })).toBeVisible();
    await french.goto('/legal/privacy');
    await expect(
      french.getByRole('heading', { level: 1, name: 'Politique de confidentialité' }),
    ).toBeVisible();
    await expect(
      french.getByText('Responsable de la protection des renseignements personnels').first(),
    ).toBeVisible();
    await expect(
      french.getByText('Commission d’accès à l’information du Québec').first(),
    ).toBeVisible();
    await french.context().close();

    // --- An English browser reads English, and the footer links to the new page ---------------
    await forbidMapProviders(page);
    await page.goto('/legal/terms');
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(page.locator('article.legal')).toHaveAttribute('lang', 'en');
    await expect(page.locator('app-legal-draft-banner [role="status"]').first()).toContainText(
      'Draft',
    );
    await expect(page.getByTestId('legal-translation-notice')).toHaveCount(0);
    await expect(page.getByText('discovery and messaging venue').first()).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Legal', exact: true })
      .getByRole('link', { name: 'Trading safely' })
      .click();
    await expect(page).toHaveURL(/\/legal\/trading-safely$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Trading safely' })).toBeVisible();
    await expect(page.getByText('Share your address only in the chat')).toBeVisible();
    await expect(page.getByText('Report and block').first()).toBeVisible();
  });
});
