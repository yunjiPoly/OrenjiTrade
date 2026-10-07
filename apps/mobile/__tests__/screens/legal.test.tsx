import fs from 'node:fs';
import path from 'node:path';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import LegalDocumentScreen from '@/app/legal/[key]';
import LegalIndexScreen from '@/app/legal/index';
import { LEGAL_LANGUAGE_STORAGE_KEY } from '@/src/features/legal/legalLanguage';
import { LEGAL_DOCUMENT_LIST } from '@/src/legal/legalContent';
import { LEGAL_DOCUMENT_LIST_FR, LEGAL_TRANSLATION_NOTICE_FR } from '@/src/legal/legalContent.fr';

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
  it('lists every document (the "Trading safely" page included) with the version the API publishes', async () => {
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    await renderWithProviders(<LegalIndexScreen />);
    expect(screen.getByTestId('legal-draft-banner')).toBeOnTheScreen();
    expect(screen.queryByTestId('legal-translation-notice')).toBeNull();
    for (const document of LEGAL_DOCUMENT_LIST) {
      expect(screen.getByRole('link', { name: document.title })).toBeOnTheScreen();
    }
    expect(screen.getByTestId('legal-link-trading-safely')).toBeOnTheScreen();
    // Terms, privacy and cookies are published in the fixture.
    expect(await screen.findAllByText(/Current version 2026-09-01\./)).toHaveLength(3);
    await fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'terms' },
    });
  });

  it('renders a document in-app with the version to accept, even when the API is down', async () => {
    mockParams.current = { key: 'terms' };
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    const { unmount } = await renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getByRole('header', { name: 'Terms of Service' })).toBeOnTheScreen();
    expect(await screen.findByTestId('legal-published-version')).toHaveTextContent(
      /Version to accept: 2026-09-01/
    );
    await unmount();

    mockApi({ 'GET /api/v1/public/legal/documents': problem(503, 'SERVICE_UNAVAILABLE', 'down') });
    await renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getByRole('header', { name: 'Terms of Service' })).toBeOnTheScreen();
    expect(screen.queryByTestId('legal-published-version')).toBeNull();
  });

  it('handles an unknown document', async () => {
    mockParams.current = { key: 'nope' };
    mockApi({});
    await renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getByText('Unknown legal document')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open legal index' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/legal');
  });

  it('is French by default on a French device, with the draft banner and the translation marking', async () => {
    mockLocales('fr-CA');
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    await renderWithProviders(<LegalIndexScreen />);
    expect(screen.getByText('Mentions légales')).toBeOnTheScreen();
    expect(screen.getByTestId('legal-draft-banner')).toHaveTextContent(
      /Ébauche — doit être révisée/
    );
    expect(screen.getByTestId('legal-translation-notice')).toHaveTextContent(
      LEGAL_TRANSLATION_NOTICE_FR
    );
    for (const document of LEGAL_DOCUMENT_LIST_FR) {
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
    const { unmount } = await renderWithProviders(<LegalDocumentScreen />);
    expect(screen.getByRole('header', { name: 'Échanger en toute sécurité' })).toBeOnTheScreen();
    expect(screen.getByText(/Date d’entrée en vigueur/)).toBeOnTheScreen();
    expect(screen.getByText('Nous joindre')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByRole('header', { name: 'Trading safely' })).toBeOnTheScreen();
    expect(screen.getByTestId('legal-draft-banner')).toHaveTextContent(/Draft — requires review/);
    expect(screen.queryByTestId('legal-translation-notice')).toBeNull();
    expect(screen.getByText(/Effective date:/)).toBeOnTheScreen();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = JSON.parse((await AsyncStorage.getItem(LEGAL_LANGUAGE_STORAGE_KEY)) ?? '{}') as {
      state?: { choice?: string };
    };
    expect(stored.state?.choice).toBe('en');
    await unmount();

    // The explicit choice wins over the French device on the next screen.
    await renderWithProviders(<LegalIndexScreen />);
    expect(screen.getByText('Legal')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Français' }));
    expect(screen.getByText('Mentions légales')).toBeOnTheScreen();
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
});
