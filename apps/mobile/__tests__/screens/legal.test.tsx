import fs from 'node:fs';
import path from 'node:path';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import LegalDocumentScreen from '@/app/legal/[key]';
import LegalIndexScreen from '@/app/legal/index';
import { PHONE_LEGAL_KEYS, PHONE_LEGAL_SUMMARIES } from '@/src/features/legal/legalDocs';
import { LEGAL_LANGUAGE_STORAGE_KEY } from '@/src/features/legal/legalLanguage';
import { LEGAL_DOCUMENT_LIST, type LegalDocument } from '@/src/legal/legalContent';
import { LEGAL_DOCUMENT_LIST_FR, LEGAL_TRANSLATION_NOTICE_FR } from '@/src/legal/legalContent.fr';
import { PINNED_MAX_FONT_SCALE } from '@/src/theme';

import { LEGAL_DOCUMENTS } from '../support/fixtures';
import { mockLocales } from '../support/locales';
import { mockApi, ok, problem } from '../support/mockApi';
import { mockParams, mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockLocales('en-CA');
});

describe('Legal pages', () => {
  it("lists the phone's seven documents (Trading safely included) with the version the API publishes", async () => {
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<LegalIndexScreen />);
    expect(screen.getByRole('header', { name: 'Legal' })).toBeOnTheScreen();
    // The amber banner of mockup v50 (stage R13).
    expect(screen.getByTestId('legal-draft-banner')).toHaveTextContent(
      /Draft\. Requires review by qualified legal counsel before launch\.$/
    );
    expect(screen.queryByTestId('legal-translation-notice')).toBeNull();
    expect(PHONE_LEGAL_KEYS).toHaveLength(7);
    for (const document of LEGAL_DOCUMENT_LIST) {
      if (PHONE_LEGAL_KEYS.includes(document.key)) {
        expect(screen.getByRole('link', { name: document.title })).toBeOnTheScreen();
      } else {
        // The payment protection and refund policies are the web's (ADR 0018).
        expect(screen.queryByRole('link', { name: document.title })).toBeNull();
      }
    }
    expect(screen.queryByTestId('legal-link-payment-protection')).toBeNull();
    expect(screen.queryByTestId('legal-link-refund-dispute')).toBeNull();
    // In the mockup's order, each with its one line.
    expect(screen.getAllByRole('link').map((link) => link.props.testID as string)).toEqual(
      PHONE_LEGAL_KEYS.map((key) => `legal-link-${key}`)
    );
    expect(screen.getByText(PHONE_LEGAL_SUMMARIES['trading-safely'] as string)).toBeOnTheScreen();
    // Terms, privacy and cookies are published in the fixture.
    expect(await screen.findAllByText(/ Version 2026-09-01\.$/)).toHaveLength(3);
    fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'terms' },
    });
  });

  it('renders a document in-app with the version to accept, even when the API is down', async () => {
    mockParams.current = { key: 'terms' };
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    const { unmount } = renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getByRole('header', { name: 'Terms of Service' })).toBeOnTheScreen();
    // The top bar names the document shortly.
    expect(screen.getByRole('header', { name: 'Terms' })).toBeOnTheScreen();
    expect(await screen.findByTestId('legal-published-version')).toHaveTextContent(
      /Version to accept: 2026-09-01/
    );
    unmount();

    mockApi({ 'GET /api/v1/public/legal/documents': problem(503, 'SERVICE_UNAVAILABLE', 'down') });
    renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getByRole('header', { name: 'Terms of Service' })).toBeOnTheScreen();
    expect(screen.queryByTestId('legal-published-version')).toBeNull();
  });

  it('handles an unknown document', () => {
    mockParams.current = { key: 'nope' };
    mockApi({});
    renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getByText('Unknown legal document')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Open legal index' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/legal');
  });

  it('is French by default on a French device, with the draft banner and the translation marking', async () => {
    mockLocales('fr-CA');
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<LegalIndexScreen />);
    expect(screen.getByText('Mentions légales')).toBeOnTheScreen();
    expect(screen.getByTestId('legal-draft-banner')).toHaveTextContent(
      /Ébauche — doit être révisée/
    );
    expect(screen.getByTestId('legal-translation-notice')).toHaveTextContent(
      LEGAL_TRANSLATION_NOTICE_FR
    );
    for (const document of LEGAL_DOCUMENT_LIST_FR.filter((doc) =>
      PHONE_LEGAL_KEYS.includes(doc.key)
    )) {
      expect(screen.getByRole('link', { name: document.title })).toBeOnTheScreen();
    }
    expect(screen.getByRole('link', { name: 'Échanger en toute sécurité' })).toBeOnTheScreen();
    expect(await screen.findAllByText(/Version en vigueur : 2026-09-01\./)).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'English' })).not.toBeChecked();
  });

  it('switches EN / FR on a document and remembers the choice on the device', async () => {
    mockLocales('fr-CA');
    mockParams.current = { key: 'trading-safely' };
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    const { unmount } = renderWithProviders(<LegalDocumentScreen />);
    expect(
      screen.getAllByRole('header', { name: 'Échanger en toute sécurité' }).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Date d’entrée en vigueur/)).toBeOnTheScreen();
    expect(screen.getByText('Nous joindre')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getAllByRole('header', { name: 'Trading safely' }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('legal-draft-banner')).toHaveTextContent(/Draft\. Requires review/);
    expect(screen.queryByTestId('legal-translation-notice')).toBeNull();
    expect(screen.getByText(/Effective date:/)).toBeOnTheScreen();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = JSON.parse((await AsyncStorage.getItem(LEGAL_LANGUAGE_STORAGE_KEY)) ?? '{}') as {
      state?: { choice?: string };
    };
    expect(stored.state?.choice).toBe('en');
    unmount();

    // The explicit choice wins over the French device on the next screen.
    renderWithProviders(<LegalIndexScreen />);
    expect(screen.getByText('Legal')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
    expect(screen.getByText('Mentions légales')).toBeOnTheScreen();
  });

  it('shows the Trading safely page of deals by mail in both languages (ADR 0018)', () => {
    mockLocales('en-CA');
    mockParams.current = { key: 'trading-safely' };
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getAllByRole('header', { name: 'Trading safely' }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('legal-draft-banner')).toBeOnTheScreen();
    for (const heading of ['How deals work', 'Before you pay', 'Shipping', 'Warning signs']) {
      expect(screen.getAllByText(new RegExp(heading)).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/Interac e-Transfer/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Before you meet|public place|safe exchange zones/)).toBeNull();

    fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
    expect(
      screen.getAllByRole('header', { name: 'Échanger en toute sécurité' }).length
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('legal-translation-notice')).toBeOnTheScreen();
    for (const heading of [
      'Comment se concluent les transactions',
      'Avant de payer',
      'Expédition',
    ]) {
      expect(screen.getAllByText(new RegExp(heading)).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/virement Interac/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Avant la rencontre|lieu public|zones d’échange/)).toBeNull();
    // As a Quebec reader writes it (review of R1): no calque of "stays as a record", no
    // "publication publique".
    expect(screen.getByText(/La conversation en garde une trace\./)).toBeOnTheScreen();
    expect(
      screen.getByText(
        /Ne communiquez votre adresse que dans la conversation privée avec l’autre collectionneur, jamais dans une publication, un cartable ou votre profil\./
      )
    ).toBeOnTheScreen();
    expect(screen.queryByText(/reste comme trace|publication publique/)).toBeNull();
  });

  it('ships exactly the texts of the web app in both languages (npm run sync:legal)', () => {
    const root = path.resolve(__dirname, '..', '..');
    const webDir = path.join(root, '..', 'web-angular', 'src', 'app', 'features', 'legal');
    const read = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const web = read(path.join(webDir, 'legal-content.ts'));
    const mobile = read(path.join(root, 'src', 'legal', 'legalContent.ts'));
    expect(mobile.endsWith(web)).toBe(true);
    expect(mobile.startsWith('// GENERATED by `npm run sync:legal`')).toBe(true);

    const webFr = read(path.join(webDir, 'legal-content.fr.ts')).replace(
      "from './legal-content'",
      "from './legalContent'"
    );
    const mobileFr = read(path.join(root, 'src', 'legal', 'legalContent.fr.ts'));
    expect(mobileFr.endsWith(webFr)).toBe(true);
    expect(mobileFr.startsWith('// GENERATED by `npm run sync:legal`')).toBe(true);
  });

  it('keeps English and Français whole at the largest text size (review fix 1)', () => {
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<LegalIndexScreen />);
    for (const name of ['English', 'Français']) {
      const word = screen.getByText(name);
      // One line, following the text size a little only, like the app's segmented controls.
      expect(word).toHaveProp('numberOfLines', 1);
      expect(word).toHaveProp('maxFontSizeMultiplier', PINNED_MAX_FONT_SCALE);
      expect(screen.getByRole('radio', { name })).toHaveProp(
        'accessibilityShowsLargeContentViewer',
        true
      );
    }
  });
});

/**
 * Deals happen in the chat and cards ship by mail (ADR 0018, stage R1 of the phone redesign): the
 * Trading safely text in both languages says how a deal works by mail, what to check before paying,
 * the warning signs and how to report or block, without any meetup advice. It stays a draft
 * (version, no effective date) and claims no legal compliance. These read the phone's copy, which
 * the test above keeps identical to the web files: the web is paused (owner order of 2026-10-12)
 * and its own spec files only follow the sentences they already pinned.
 */
describe('the Trading safely text ships by mail (ADR 0018)', () => {
  const page = (doc: LegalDocument | undefined): string =>
    doc
      ? [
          doc.summary,
          ...doc.sections.flatMap((section) => [section.heading, ...section.clauses]),
        ].join('\n')
      : '';
  const english = page(LEGAL_DOCUMENT_LIST.find((doc) => doc.key === 'trading-safely'));
  const french = page(LEGAL_DOCUMENT_LIST_FR.find((doc) => doc.key === 'trading-safely'));

  it('says how a deal works by mail, in English', () => {
    expect(english).toContain('the cards ship by mail');
    expect(english).toContain('OrenjiTrade never handles the money');
    expect(english).toContain('Interac e-Transfer');
    expect(english).toContain('ratings and references');
    expect(english).toContain('photos of the real card');
    expect(english).toContain('with tracking');
    expect(english).toContain('Share your address only in the chat');
    expect(english).toMatch(/gift cards or cryptocurrency/);
    expect(english).toContain('Report and block');
    expect(english).not.toMatch(/\bmeet|in person|public place|daylight|café|police station/i);
    expect(english).not.toMatch(/complies|compliant|in compliance|escrow|guarantee/i);
  });

  it('says the same in French', () => {
    expect(french).toContain('les cartes sont expédiées par la poste');
    expect(french).toContain('OrenjiTrade ne gère jamais l’argent');
    expect(french).toContain('virement Interac');
    expect(french).toContain('évaluations et les références');
    expect(french).toContain('photos de la vraie carte');
    expect(french).toContain('numéro de suivi');
    expect(french).toContain('Ne communiquez votre adresse que dans la conversation');
    expect(french).toMatch(/cartes-cadeaux ou de cryptomonnaies/);
    expect(french).toContain('Signaler et bloquer');
    expect(french).not.toMatch(/rencontr|en personne|lieu public|de jour|café|poste de police/i);
    expect(french).not.toMatch(/conforme|garanti|entiercement/i);
  });

  it('stays a draft in both languages', () => {
    for (const list of [LEGAL_DOCUMENT_LIST, LEGAL_DOCUMENT_LIST_FR]) {
      const doc = list.find((candidate) => candidate.key === 'trading-safely');
      expect(doc?.version).toBe('0.2-draft');
      expect(doc?.effectiveDate).toBeNull();
    }
  });
});
