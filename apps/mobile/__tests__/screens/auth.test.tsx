import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ResetPasswordScreen from '@/app/(auth)/reset-password';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import { useFlowLock } from '@/src/account/flowLock';
import { AuthError } from '@/src/auth/authErrors';
import { useAppStore } from '@/src/store/useAppStore';

import { FakeAuthPort } from '../support/fakeAuthPort';
import { LEGAL_DOCUMENTS, NOT_ONBOARDED, meFixture } from '../support/fixtures';
import { mockApi, noContent, ok, problem } from '../support/mockApi';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useAppStore.getState().reset();
});

describe('Sign in', () => {
  it('validates the form before calling Firebase', async () => {
    const port = new FakeAuthPort();
    mockApi({});
    renderWithProviders(<SignInScreen />, { port });

    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Email'), 'maika@');
    expect(screen.getByText('That email address does not look right.')).toBeOnTheScreen();
    expect(port.signIn).not.toHaveBeenCalled();
  });

  it('shows a friendly error for wrong credentials', async () => {
    const port = new FakeAuthPort();
    mockApi({});
    renderWithProviders(<SignInScreen />, { port });

    fireEvent.changeText(screen.getByLabelText('Email'), 'maika@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent(
      /No account matches these credentials\./
    );
  });

  it('signs in and remembers the email (never the password)', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    renderWithProviders(<SignInScreen />, { port });

    fireEvent.changeText(screen.getByLabelText('Email'), ' maika@example.test ');
    fireEvent.changeText(screen.getByLabelText('Password'), 'correct-password');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(port.signIn).toHaveBeenCalledWith('maika@example.test', 'correct-password')
    );
    await waitFor(() =>
      expect(useAppStore.getState().prefs.lastSignedInEmail).toBe('maika@example.test')
    );
    expect(JSON.stringify(useAppStore.getState())).not.toContain('correct-password');
  });

  it('links to account creation, password reset and the legal pages', () => {
    mockApi({});
    renderWithProviders(<SignInScreen />, { port: new FakeAuthPort() });
    fireEvent.press(screen.getByText('Create an account'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-up');
    fireEvent.press(screen.getByText('Forgot your password?'));
    expect(mockRouter.push).toHaveBeenCalledWith('/reset-password');
  });
});

describe('Sign up', () => {
  it('shows a skeleton while the legal documents load', () => {
    mockApi({ 'GET /api/v1/public/legal/documents': () => new Promise(() => undefined) });
    renderWithProviders(<SignUpScreen />, { port: new FakeAuthPort() });
    expect(screen.getByTestId('sign-up-legal-loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('offers a retry when the legal documents cannot be loaded', async () => {
    const api = mockApi({
      'GET /api/v1/public/legal/documents': [
        problem(503, 'SERVICE_UNAVAILABLE', 'down'),
        ok(LEGAL_DOCUMENTS),
      ],
    });
    renderWithProviders(<SignUpScreen />, { port: new FakeAuthPort() });
    expect(await screen.findByText('We could not load the terms')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox', { name: 'Accept all' })).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/public/legal/documents')).toHaveLength(2);
  });

  it('validates every field and the consents', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });

    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter a display name.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Choose a password.')).toBeOnTheScreen();
    expect(screen.getByText('Please accept every document to continue.')).toBeOnTheScreen();
    expect(port.signUp).not.toHaveBeenCalled();
  });

  it('creates the account, records each consent and opens the verification screen', async () => {
    const port = new FakeAuthPort();
    const api = mockApi({
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': noContent,
      'GET /api/v1/me': ok(meFixture({ onboarding: NOT_ONBOARDED, emailVerified: false })),
    });
    renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Nouvelle');
    fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass');
    // The texts are readable in-app before accepting them.
    fireEvent.press(screen.getByLabelText('Read the Terms of Service'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'terms' },
    });
    fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    expect(
      screen.getByRole('checkbox', { name: 'I have read and accept the Terms of Service' })
    ).toBeChecked();
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/verify-email'));
    expect(port.signUp).toHaveBeenCalledWith('new@example.test', 'long-enough-pass');
    expect(port.updateDisplayName).toHaveBeenCalledWith('Nouvelle');
    expect(port.sendEmailVerification).toHaveBeenCalled();
    expect(api.callsTo('POST /api/v1/me/consents').map((call) => call.body)).toEqual([
      { documentType: 'TERMS', version: '2026-09-01' },
      { documentType: 'PRIVACY', version: '2026-09-01' },
    ]);
    // The gate stays held until the verification screen releases it.
    expect(useFlowLock.getState().lockedBy).toBe('sign-up');
  });

  it('shows the friendly error and releases the gate when sign-up fails', async () => {
    const port = new FakeAuthPort();
    port.signUp.mockRejectedValueOnce(new AuthError('auth/email-already-in-use'));
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka');
    fireEvent.changeText(screen.getByLabelText('Email'), 'maika@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByTestId('sign-up-error')).toHaveTextContent(
      /An account already exists for this email/
    );
    expect(useFlowLock.getState().lockedBy).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe('Reset password', () => {
  it('validates the email, then confirms without revealing whether the account exists', async () => {
    const port = new FakeAuthPort();
    port.sendPasswordReset.mockRejectedValueOnce(new AuthError('auth/user-not-found'));
    mockApi({});
    renderWithProviders(<ResetPasswordScreen />, { port });

    fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter your email address.')).toBeOnTheScreen();

    fireEvent.changeText(screen.getByLabelText('Email'), 'nobody@example.test');
    fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByTestId('reset-sent')).toHaveTextContent(
      /If an account exists for nobody@example\.test/
    );

    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
  });

  it('shows other failures', async () => {
    const port = new FakeAuthPort();
    port.sendPasswordReset.mockRejectedValueOnce(new AuthError('auth/too-many-requests'));
    mockApi({});
    renderWithProviders(<ResetPasswordScreen />, { port });
    fireEvent.changeText(screen.getByLabelText('Email'), 'maika@example.test');
    fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(
      await screen.findByText('Too many attempts. Wait a moment, then try again.')
    ).toBeOnTheScreen();
  });
});
