import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ConsentScreen from '@/app/(account)/consent';
import SuspendedScreen from '@/app/(account)/suspended';
import AccountUnavailableScreen from '@/app/(account)/unavailable';
import VerifyEmailScreen from '@/app/(account)/verify-email';
import { useFlowLock } from '@/src/account/flowLock';

import { FakeAuthPort, testUser } from '../support/fakeAuthPort';
import { LEGAL_DOCUMENTS, NOT_ONBOARDED, deletionFixture, meFixture } from '../support/fixtures';
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
});

describe('Consent screen', () => {
  const pending = [
    { documentType: 'TERMS' as const, version: '2026-10-01' },
    { documentType: 'PRIVACY' as const, version: '2026-10-01' },
  ];

  it('requires every pending document, then records each acceptance', async () => {
    const api = mockApi({
      'GET /api/v1/me': [ok(meFixture({ requiredConsents: pending })), ok(meFixture())],
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': noContent,
    });
    renderWithProviders(<ConsentScreen />, { port: new FakeAuthPort(testUser()) });

    expect(
      await screen.findByRole('checkbox', { name: 'I have read and accept the Terms of Service' })
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Accept and continue' }));
    expect(screen.getByText('Please accept every document to continue.')).toBeOnTheScreen();
    expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(0);

    fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    fireEvent.press(screen.getByRole('button', { name: 'Accept and continue' }));
    await waitFor(() => expect(api.callsTo('POST /api/v1/me/consents')).toHaveLength(2));
    expect(api.callsTo('POST /api/v1/me/consents')[0]?.body).toEqual({
      documentType: 'TERMS',
      version: '2026-10-01',
    });
    expect(await screen.findByText('You have accepted every current document.')).toBeOnTheScreen();
  });

  it('shows a failure and lets the collector sign out', async () => {
    const port = new FakeAuthPort(testUser());
    mockApi({
      'GET /api/v1/me': ok(meFixture({ requiredConsents: pending })),
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': problem(429, 'RATE_LIMITED', 'slow down'),
    });
    renderWithProviders(<ConsentScreen />, { port });
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Accept all' }));
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
    expect(await screen.findByTestId('snackbar')).toHaveTextContent(
      'Deletion cancelled. Welcome back!'
    );
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
      /Suspended for repeated spam\. The suspension ends on/
    );
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
    expect(screen.getByText('We could not load your account')).toBeOnTheScreen();
    expect(screen.getByText('Please try again in a moment.')).toBeOnTheScreen();
    expect(screen.queryByText(/SQL details/)).toBeNull();
    const before = api.callsTo('GET /api/v1/me').length;
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(api.callsTo('GET /api/v1/me').length).toBe(before + 1));
  });
});
