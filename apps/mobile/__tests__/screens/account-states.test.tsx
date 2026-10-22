import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ConsentScreen from '@/app/(account)/consent';
import SuspendedScreen from '@/app/(account)/suspended';
import AccountUnavailableScreen from '@/app/(account)/unavailable';
import VerifyEmailScreen from '@/app/(account)/verify-email';
import { useFlowLock } from '@/src/account/flowLock';
import { AGE_CONFIRMATION_LABEL_EN } from '@/src/features/legal/ageConfirmation';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { LEGAL_DOCUMENTS, NOT_ONBOARDED, deletionFixture, meFixture } from '../support/fixtures';
import { mockLocales } from '../support/locales';
import { mockApi, noContent, ok, problem } from '../support/mockApi';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());
jest.mock('@/src/features/account/exportData', () => ({
  exportMyData: jest.fn(async () => 'orenjitrade-export-maika-2026-10-04.json'),
}));

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  mockLocales('en-CA');
});

describe('Consent screen', () => {
  const pending = [
    { documentType: 'TERMS' as const, version: '2026-10-01' },
    { documentType: 'PRIVACY' as const, version: '2026-10-01' },
  ];

  it('lists each due document with its version, waits for every box, then records each', async () => {
    const api = mockApi({
      'GET /api/v1/me': [ok(meFixture({ requiredConsents: pending })), ok(meFixture())],
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': noContent,
    });
    renderWithProviders(<ConsentScreen />, { port: new FakeAuthPort(testUser()) });

    const terms = await screen.findByRole('checkbox', {
      name: 'I accept the Terms of Service, version 2026-10-01',
    });
    expect(screen.getAllByText('Version 2026-10-01')).toHaveLength(2);
    // Two documents: no "Accept all" (mockup v50 screen 43), and each can be read.
    expect(screen.queryByRole('checkbox', { name: 'Accept all' })).toBeNull();
    fireEvent.press(screen.getByLabelText('Read the Privacy Policy'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'privacy' },
    });
    const accept = () => screen.getByRole('button', { name: 'Accept and continue' });
    expect(accept()).toBeDisabled();
    fireEvent.press(terms);
    expect(accept()).toBeDisabled();
    fireEvent.press(
      screen.getByRole('checkbox', { name: 'I accept the Privacy Policy, version 2026-10-01' })
    );
    expect(accept()).toBeEnabled();
    fireEvent.press(accept());
    await waitFor(() => expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(2));
    expect(api.callsTo('POST /api/v1/me/consents')[0]?.body).toEqual({
      documentType: 'TERMS',
      version: '2026-10-01',
      language: 'en',
    });
    // An account that already confirmed its age (the fixture) is not asked again.
    expect(screen.queryByRole('checkbox', { name: /18 years of age/ })).toBeNull();
    expect(await screen.findByText('You have accepted every current document.')).toBeOnTheScreen();
  });

  it('offers "Accept all" once more than two documents are due, never ticking the age', async () => {
    mockApi({
      'GET /api/v1/me': ok(
        meFixture({
          // Listed by the API in another order: shown in the reading order, terms first.
          requiredConsents: [
            { documentType: 'COMMUNITY_GUIDELINES' as const, version: '2026-10-01' },
            ...[...pending].reverse(),
          ],
          onboarding: { ...NOT_ONBOARDED, ageConfirmed: false },
        })
      ),
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
    });
    renderWithProviders(<ConsentScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Accept all' }));
    expect(
      screen
        .getAllByRole('checkbox')
        .map((box) => box.props.accessibilityLabel as string)
        .slice(0, 4)
    ).toEqual([
      'Accept all',
      'I accept the Terms of Service, version 2026-10-01',
      'I accept the Privacy Policy, version 2026-10-01',
      'I accept the Community Guidelines, version 2026-10-01',
    ]);
    expect(
      screen.getByRole('checkbox', { name: 'I accept the Terms of Service, version 2026-10-01' })
    ).toBeChecked();
    expect(screen.getByRole('checkbox', { name: AGE_CONFIRMATION_LABEL_EN })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Accept and continue' })).toBeDisabled();
  });

  it('collects the 18+ confirmation from an account that never gave it (a Google sign-up)', async () => {
    mockLocales('fr-CA');
    const api = mockApi({
      'GET /api/v1/me': [
        ok(
          meFixture({
            requiredConsents: pending,
            onboarding: { ...NOT_ONBOARDED, ageConfirmed: false },
          })
        ),
        ok(meFixture({ onboarding: { ...NOT_ONBOARDED, ageConfirmed: true } })),
      ],
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': noContent,
    });
    renderWithProviders(<ConsentScreen />, { port: new FakeAuthPort(testUser()) });
    // French device: the document titles come from the French texts (the legal language, kept
    // as it was); the 18+ line is English only since stage R12.
    fireEvent.press(
      await screen.findByRole('checkbox', {
        name: 'I accept the Conditions d’utilisation, version 2026-10-01',
      })
    );
    fireEvent.press(
      screen.getByRole('checkbox', {
        name: 'I accept the Politique de confidentialité, version 2026-10-01',
      })
    );
    const age = screen.getByRole('checkbox', { name: AGE_CONFIRMATION_LABEL_EN });
    expect(age).not.toBeChecked();
    expect(screen.queryByText(/Je confirme/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept and continue' })).toBeDisabled();
    expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(0);

    fireEvent.press(age);
    fireEvent.press(screen.getByRole('button', { name: 'Accept and continue' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(3));
    expect(api.callsTo('POST /api/v1/me/consents').map((call) => call.body)).toEqual([
      { documentType: 'TERMS', version: '2026-10-01', language: 'fr' },
      { documentType: 'PRIVACY', version: '2026-10-01', language: 'fr' },
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05', language: 'fr' },
    ]);
  });

  it('asks only the age line when no document is due, then welcomes the collector back', async () => {
    const api = mockApi({
      'GET /api/v1/me': [
        ok(meFixture({ onboarding: { ...NOT_ONBOARDED, ageConfirmed: false } })),
        ok(meFixture()),
      ],
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': noContent,
    });
    renderWithProviders(<ConsentScreen />, { port: new FakeAuthPort(testUser()) });
    const age = await screen.findByRole('checkbox', { name: AGE_CONFIRMATION_LABEL_EN });
    expect(
      screen.getByText('Please confirm your age to keep using OrenjiTrade.')
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('legal-consents')).toBeNull();
    expect(screen.getByRole('button', { name: 'Accept and continue' })).toBeDisabled();
    fireEvent.press(age);
    fireEvent.press(screen.getByRole('button', { name: 'Accept and continue' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(1));
    expect(api.callsTo('POST /api/v1/me/consents')[0]?.body).toEqual({
      documentType: 'AGE_CONFIRMATION',
      version: '2026-10-05',
      language: 'en',
    });
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Thanks for confirming. Welcome back!'
    );
  });

  it('retries the confirmation when the documents cannot be loaded', async () => {
    const api = mockApi({
      'GET /api/v1/me': ok(meFixture({ onboarding: { ...NOT_ONBOARDED, ageConfirmed: false } })),
      'GET /api/v1/public/legal/documents': [
        problem(503, 'SERVICE_UNAVAILABLE', 'down'),
        ok(LEGAL_DOCUMENTS),
      ],
    });
    renderWithProviders(<ConsentScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('We could not load the confirmation')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Accept and continue' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('checkbox', { name: AGE_CONFIRMATION_LABEL_EN })
    ).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/public/legal/documents')).toHaveLength(2);
  });

  it('shows a failure and lets the collector sign out', async () => {
    const port = new FakeAuthPort(testUser());
    mockApi({
      'GET /api/v1/me': ok(meFixture({ requiredConsents: pending })),
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': problem(429, 'RATE_LIMITED', 'slow down'),
    });
    renderWithProviders(<ConsentScreen />, { port });
    fireEvent.press(
      await screen.findByRole('checkbox', {
        name: 'I accept the Terms of Service, version 2026-10-01',
      })
    );
    fireEvent.press(
      screen.getByRole('checkbox', { name: 'I accept the Privacy Policy, version 2026-10-01' })
    );
    fireEvent.press(screen.getByRole('button', { name: 'Accept and continue' }));
    expect(await screen.findByText(/Too many requests in a short time/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(port.signOut).toHaveBeenCalled());
  });
});

describe('Account status screen', () => {
  it('explains a pending deletion and cancels it', async () => {
    const api = mockApi({
      'GET /api/v1/me': [ok(meFixture({ status: 'DELETION_REQUESTED' })), ok(meFixture())],
      'GET /api/v1/me/deletion-requests': ok([deletionFixture()]),
      'DELETE /api/v1/me/deletion-requests/{id}': noContent,
    });
    renderWithProviders(<SuspendedScreen />, { port: new FakeAuthPort(testUser()) });

    expect(await screen.findByText('Your account is scheduled for deletion')).toBeOnTheScreen();
    expect(await screen.findByTestId('deletion-scheduled')).toHaveTextContent(
      /will be permanently deleted on/
    );
    fireEvent.press(screen.getByRole('button', { name: 'Cancel deletion' }));
    await waitFor(() =>
      expect(api.callsTo('DELETE /api/v1/me/deletion-requests/{id}')).toHaveLength(1)
    );
    expect(api.callsTo('DELETE /api/v1/me/deletion-requests/{id}')[0]?.path).toBe(
      '/api/v1/me/deletion-requests/00000000-0000-4000-8000-0000000000d1'
    );
    // "Deletion cancelled" shows in place while the gate waits; Continue lets it go on.
    expect(await screen.findByRole('header', { name: 'Deletion cancelled' })).toBeOnTheScreen();
    expect(screen.getByTestId('deletion-cancelled')).toHaveTextContent('Welcome back!');
    expect(useFlowLock.getState().lockedBy).toBe('deletion-cancelled');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(useFlowLock.getState().lockedBy).toBeNull());
  });

  it('keeps the deletion when cancelling fails, and the gate free', async () => {
    mockApi({
      'GET /api/v1/me': ok(meFixture({ status: 'DELETION_REQUESTED' })),
      'GET /api/v1/me/deletion-requests': ok([deletionFixture()]),
      'DELETE /api/v1/me/deletion-requests/{id}': problem(503, 'SERVICE_UNAVAILABLE', 'down'),
    });
    renderWithProviders(<SuspendedScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('button', { name: 'Cancel deletion' }));
    expect(await screen.findByTestId('suspended-error')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Your account is scheduled for deletion' })
    ).toBeOnTheScreen();
    expect(useFlowLock.getState().lockedBy).toBeNull();
  });

  it('downloads the data while the deletion is pending', async () => {
    const { exportMyData } = jest.requireMock('@/src/features/account/exportData') as {
      exportMyData: jest.Mock;
    };
    mockApi({
      'GET /api/v1/me': ok(meFixture({ status: 'DELETION_REQUESTED' })),
      'GET /api/v1/me/deletion-requests': ok([deletionFixture()]),
    });
    renderWithProviders(<SuspendedScreen />, { port: new FakeAuthPort(testUser()) });
    fireEvent.press(await screen.findByRole('button', { name: 'Download my data' }));
    await waitFor(() => expect(exportMyData).toHaveBeenCalledWith('maika'));
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(/is ready/);
  });

  it('explains a temporary suspension from a 403 answer', async () => {
    mockApi({
      'GET /api/v1/me': problem(403, 'ACCOUNT_SUSPENDED', 'Suspended for repeated spam.', {
        suspendedUntil: '2026-10-20T12:00:00Z',
      }),
    });
    renderWithProviders(<SuspendedScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByText('Your account is suspended')).toBeOnTheScreen();
    expect(screen.getByTestId('suspension-message')).toHaveTextContent(
      'Suspended for repeated spam.'
    );
    expect(screen.getByTestId('suspension-until')).toHaveTextContent(
      /^The suspension ends on October 20, 2026\.$/
    );
    expect(screen.getByText('support@orenjitrade.com')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Community guidelines' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'community-guidelines' },
    });
  });
});

describe('Verify email screen', () => {
  it('releases the sign-up lock, checks the verification and continues to onboarding', async () => {
    useFlowLock.getState().lock('sign-up');
    const port = new FakeAuthPort(testUser({ emailVerified: false }));
    port.reload
      .mockResolvedValueOnce(testUser({ emailVerified: false }))
      .mockResolvedValueOnce(testUser({ emailVerified: true }));
    mockApi({ 'GET /api/v1/me': ok(meFixture({ onboarding: NOT_ONBOARDED })) });
    renderWithProviders(<VerifyEmailScreen />, { port });

    expect(useFlowLock.getState().lockedBy).toBeNull();
    expect(screen.getByText(/Local development: no real email is sent/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'I have verified my email' }));
    expect(await screen.findByTestId('verify-message')).toHaveTextContent(
      /We do not see the verification yet/
    );

    fireEvent.press(screen.getByRole('button', { name: 'I have verified my email' }));
    await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledWith('/onboarding'));
    expect(port.getIdToken).toHaveBeenCalledWith(true);
  });

  it('resends the email with a cooldown', async () => {
    const port = new FakeAuthPort(testUser({ emailVerified: false }));
    mockApi({ 'GET /api/v1/me': ok(meFixture({ onboarding: NOT_ONBOARDED })) });
    renderWithProviders(<VerifyEmailScreen />, { port });
    fireEvent.press(screen.getByRole('button', { name: 'Resend email' }));
    expect(await screen.findByText('A new verification email is on its way.')).toBeOnTheScreen();
    expect(port.sendEmailVerification).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Resend in \d+ s/ })).toBeDisabled();
  });
});

describe('Account unavailable screen', () => {
  it('retries GET /me', async () => {
    const api = mockApi({
      'GET /api/v1/me': problem(500, 'INTERNAL_ERROR', 'SQL details never shown'),
    });
    renderWithProviders(<AccountUnavailableScreen />, { port: new FakeAuthPort(testUser()) });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'We could not load your account' })
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Check your connection, then try again. Nothing on your account changed.')
    ).toBeOnTheScreen();
    expect(screen.queryByText(/SQL details/)).toBeNull();
    const before = api.callsTo('GET /api/v1/me').length;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.callsTo('GET /api/v1/me').length).toBe(before + 1));
  });
});
