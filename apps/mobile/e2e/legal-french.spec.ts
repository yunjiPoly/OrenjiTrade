import { expect, test } from './support/fixtures';
import { requireStack, screen } from './support/stack';

/**
 * The French legal pages on mobile (launch readiness, Bill 96): French by default for a French
 * device, the EN / FR switch on the index and on every document, the choice remembered on the
 * device, the draft banner on both languages and the translation marking on the French pages,
 * the "Trading safely" page in both languages. Legal pages are readable signed out.
 */
test.describe('mobile legal pages in French', () => {
  requireStack();

  test.describe('on a French device', () => {
    test.use({ locale: 'fr-CA' });

    test('is French by default, switches to English, and remembers the choice', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto('/legal');
      const index = screen(page, 'legal');
      await expect(index.getByRole('heading', { name: 'Mentions légales' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(index.getByTestId('legal-draft-banner')).toContainText(
        'Ébauche — doit être révisée'
      );
      await expect(index.getByTestId('legal-translation-notice')).toContainText(
        'Traduction de l’ébauche anglaise, à faire valider par un conseiller juridique.'
      );
      await expect(index.getByRole('radio', { name: 'Français' })).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await expect(index.getByTestId('legal-link-trading-safely')).toContainText(
        'Échanger en toute sécurité'
      );
      await expect(index.getByText(/Version en vigueur : \d{4}-\d{2}-\d{2}\./).first()).toBeVisible(
        {
          timeout: 30_000,
        }
      );

      await index.getByTestId('legal-link-trading-safely').click();
      const document = screen(page, 'legal-document');
      await expect(
        document.getByRole('heading', { name: 'Échanger en toute sécurité' })
      ).toBeVisible({ timeout: 30_000 });
      await expect(document.getByText(/Date d’entrée en vigueur/)).toBeVisible();
      await expect(document.getByTestId('legal-translation-notice')).toBeVisible();
      await expect(document.getByText('Nous joindre')).toBeVisible();

      // EN: the same page in English, the translation marking gone, the draft banner kept.
      await document.getByRole('radio', { name: 'English' }).click();
      await expect(document.getByRole('heading', { name: 'Trading safely' })).toBeVisible();
      await expect(document.getByTestId('legal-draft-banner')).toContainText(
        'Draft — requires review'
      );
      await expect(document.getByTestId('legal-translation-notice')).toHaveCount(0);
      await expect(document.getByText(/Effective date:/)).toBeVisible();

      // The explicit choice wins over the French device, and survives a reload.
      await page.goBack();
      await expect(index.getByRole('heading', { name: 'Legal' })).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(screen(page, 'legal').getByRole('heading', { name: 'Legal' })).toBeVisible({
        timeout: 30_000,
      });
      await expect(screen(page, 'legal').getByTestId('legal-translation-notice')).toHaveCount(0);
      await screen(page, 'legal').getByRole('radio', { name: 'Français' }).click();
      await expect(
        screen(page, 'legal').getByRole('heading', { name: 'Mentions légales' })
      ).toBeVisible();
    });
  });

  test('is English by default elsewhere, with the "Trading safely" page listed', async ({
    page,
  }) => {
    await page.goto('/legal');
    const index = screen(page, 'legal');
    await expect(index.getByRole('heading', { name: 'Legal' })).toBeVisible({ timeout: 30_000 });
    await expect(index.getByTestId('legal-draft-banner')).toContainText('Draft — requires review');
    await expect(index.getByTestId('legal-translation-notice')).toHaveCount(0);
    await expect(index.getByRole('radio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await index.getByTestId('legal-link-trading-safely').click();
    const document = screen(page, 'legal-document');
    await expect(document.getByRole('heading', { name: 'Trading safely' })).toBeVisible({
      timeout: 30_000,
    });
    await document.getByRole('radio', { name: 'Français' }).click();
    await expect(
      document.getByRole('heading', { name: 'Échanger en toute sécurité' })
    ).toBeVisible();
    await expect(document.getByTestId('legal-translation-notice')).toBeVisible();
  });
});
