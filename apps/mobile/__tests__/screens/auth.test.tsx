import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import ResetPasswordScreen from '@/app/(auth)/reset-password';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import { useFlowLock } from '@/src/account/flowLock';
import { AuthError } from '@/src/auth/authErrors';
import { useAppStore } from '@/src/store/useAppStore';

import { FakeAuthPort } from '../support/fakeAuthPort';
import { LEGAL_DOCUMENTS, NOT_ONBOARDED, meFixture } from '../support/fixtures';
import { mockLocales } from '../support/locales';
import { mockApi, noContent, ok, problem } from '../support/mockApi';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useAppStore.getState().reset();
  mockLocales('en-CA');
});

const AGE_LABEL = 'I confirm I am 18 years of age or older';
const AGE_ERROR = 'You must confirm that you are 18 years of age or older to use OrenjiTrade.';

describe('Sign in', () => {
  it('validates the form before calling Firebase', async () => {
    const port = new FakeAuthPort();
    mockApi({});
    await renderWithProviders(<SignInScreen />, { port });

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maika@');
    expect(screen.getByText('That email address does not look right.')).toBeOnTheScreen();
    expect(port.signIn).not.toHaveBeenCalled();
  });

  it('shows a friendly error for wrong credentials', async () => {
    const port = new FakeAuthPort();
    mockApi({});
    await renderWithProviders(<SignInScreen />, { port });

    await fireEvent.changeText(screen.getByLabelText('Email'), 'maika@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent(
      /No account matches these credentials\./
    );
  });

  it('signs in and remembers the email (never the password)', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    await renderWithProviders(<SignInScreen />, { port });

    await fireEvent.changeText(screen.getByLabelText('Email'), ' maika@example.test ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'correct-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(port.signIn).toHaveBeenCalledWith('maika@example.test', 'correct-password')
    );
    await waitFor(() =>
      expect(useAppStore.getState().prefs.lastSignedInEmail).toBe('maika@example.test')
    );
    expect(JSON.stringify(useAppStore.getState())).not.toContain('correct-password');
  });

  it('signs in with a simulated Google account against the emulator (the gate continues)', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    await renderWithProviders(<SignInScreen />, { port });

    await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    const dialog = await screen.findByTestId('google-dialog');
    expect(dialog).toHaveTextContent(/Simulated Google account/);
    // Validation of the simulated account first.
    await fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    expect(screen.getByText('Enter the e-mail of the simulated Google account.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('google-email'), 'nope');
    await fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    expect(screen.getByText('That email address does not look right.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('google-email'), 'Googler@Example.test');
    await fireEvent.changeText(screen.getByTestId('google-name'), 'Gina Google');
    await fireEvent.press(screen.getByTestId('google-dialog-confirm'));

    await waitFor(() =>
      expect(port.signInWithGoogle).toHaveBeenCalledWith({
        kind: 'emulator',
        email: 'Googler@Example.test',
        displayName: 'Gina Google',
      })
    );
    await waitFor(() => expect(port.getIdToken).toHaveBeenCalledWith(true));
    expect(port.user?.providerIds).toEqual(['google.com']);
    expect(screen.queryByTestId('google-dialog')).toBeNull();
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
  });

  it('links Google to an existing e-mail/password account of the same e-mail', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    await renderWithProviders(<SignInScreen />, { port });
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    await fireEvent.changeText(await screen.findByTestId('google-email'), 'maika@example.test');
    await fireEvent.changeText(screen.getByTestId('google-name'), 'Maïka Test');
    await fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    await waitFor(() => expect(port.user?.providerIds).toEqual(['password', 'google.com']));
    expect(port.user?.uid).toBe('uid-maika@example.test');
  });

  it('explains a Google failure, and says nothing when the window was closed', async () => {
    const port = new FakeAuthPort();
    port.signInWithGoogle.mockRejectedValueOnce(
      new AuthError('auth/account-exists-with-different-credential')
    );
    mockApi({});
    await renderWithProviders(<SignInScreen />, { port });
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    await fireEvent.changeText(await screen.findByTestId('google-email'), 'other@example.test');
    await fireEvent.changeText(screen.getByTestId('google-name'), 'Other');
    await fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent(
      /An account already exists for this email with a different sign-in method\./
    );

    // Closing the simulated-account dialog is a dismissal: no error.
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    await fireEvent.press(await screen.findByTestId('google-dialog-cancel'));
    await waitFor(() => expect(screen.queryByTestId('google-dialog')).toBeNull());
    expect(port.signInWithGoogle).toHaveBeenCalledTimes(1);

    port.signInWithGoogle.mockRejectedValueOnce(new AuthError('auth/popup-closed-by-user'));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    await fireEvent.changeText(await screen.findByTestId('google-email'), 'other@example.test');
    await fireEvent.changeText(screen.getByTestId('google-name'), 'Other');
    await fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    await waitFor(() => expect(port.signInWithGoogle).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
  });

  it('links to account creation, password reset and the legal pages', async () => {
    mockApi({});
    await renderWithProviders(<SignInScreen />, { port: new FakeAuthPort() });
    await fireEvent.press(screen.getByText('Create an account'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-up');
    await fireEvent.press(screen.getByText('Forgot your password?'));
    expect(mockRouter.push).toHaveBeenCalledWith('/reset-password');
  });
});

describe('Sign up', () => {
  it('shows a skeleton while the legal documents load', async () => {
    mockApi({ 'GET /api/v1/public/legal/documents': () => new Promise(() => undefined) });
    await renderWithProviders(<SignUpScreen />, { port: new FakeAuthPort() });
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
    await renderWithProviders(<SignUpScreen />, { port: new FakeAuthPort() });
    expect(await screen.findByText('We could not load the terms')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox', { name: 'Accept all' })).toBeOnTheScreen();
    expect(api.callsTo('GET /api/v1/public/legal/documents')).toHaveLength(2);
  });

  it('validates every field and the consents', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    await renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });

    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Enter a display name.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Choose a password.')).toBeOnTheScreen();
    expect(screen.getByText('Please accept every document to continue.')).toBeOnTheScreen();
    // The 18+ confirmation is its own statement, in both languages.
    expect(screen.getByText(AGE_ERROR)).toBeOnTheScreen();
    expect(
      screen.getByText('Vous devez confirmer avoir 18 ans ou plus pour utiliser OrenjiTrade.')
    ).toBeOnTheScreen();
    expect(port.signUp).not.toHaveBeenCalled();
  });

  it('never ticks the 18+ confirmation with "Accept all" and keeps it out of the document list', async () => {
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    await renderWithProviders(<SignUpScreen />, { port: new FakeAuthPort() });
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Accept all' }));
    expect(
      screen.getByRole('checkbox', { name: 'I have read and accept the Terms of Service' })
    ).toBeChecked();
    expect(
      screen.queryByRole('checkbox', { name: /I have read and accept the Age confirmation/ })
    ).toBeNull();
    const age = screen.getByRole('checkbox', { name: AGE_LABEL });
    expect(age).not.toBeChecked();
    expect(screen.getByText('Je confirme avoir 18 ans ou plus')).toBeOnTheScreen();
    await fireEvent.press(age);
    expect(age).toBeChecked();
  });

  it('creates the account, records each consent and opens the verification screen', async () => {
    const port = new FakeAuthPort();
    const api = mockApi({
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': noContent,
      'GET /api/v1/me': ok(meFixture({ onboarding: NOT_ONBOARDED, emailVerified: false })),
    });
    await renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });

    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Nouvelle');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass');
    // The texts are readable in-app before accepting them.
    await fireEvent.press(screen.getByLabelText('Read the Terms of Service'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/legal/[key]',
      params: { key: 'terms' },
    });
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    expect(
      screen.getByRole('checkbox', { name: 'I have read and accept the Terms of Service' })
    ).toBeChecked();
    // Every document accepted is not enough without the 18+ confirmation.
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText(AGE_ERROR)).toBeOnTheScreen();
    expect(port.signUp).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    expect(screen.queryByText(AGE_ERROR)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/verify-email'));
    expect(port.signUp).toHaveBeenCalledWith('new@example.test', 'long-enough-pass');
    expect(port.updateDisplayName).toHaveBeenCalledWith('Nouvelle');
    expect(port.sendEmailVerification).toHaveBeenCalled();
    // The documents, then the attestation, each with the language the texts were shown in.
    expect(api.callsTo('POST /api/v1/me/consents').map((call) => call.body)).toEqual([
      { documentType: 'TERMS', version: '2026-09-01', language: 'en' },
      { documentType: 'PRIVACY', version: '2026-09-01', language: 'en' },
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05', language: 'en' },
    ]);
    // The gate stays held until the verification screen releases it.
    expect(useFlowLock.getState().lockedBy).toBe('sign-up');
  });

  it('records the consents as read in French on a French device, with the French titles', async () => {
    mockLocales('fr-CA');
    const port = new FakeAuthPort();
    const api = mockApi({
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      'POST /api/v1/me/consents': noContent,
      'GET /api/v1/me': ok(meFixture({ onboarding: NOT_ONBOARDED, emailVerified: false })),
    });
    await renderWithProviders(<SignUpScreen />, { port });
    // The document titles come from the French texts; the UI around them stays English.
    expect(
      await screen.findByRole('checkbox', {
        name: 'I have read and accept the Conditions d’utilisation',
      })
    ).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Nouvelle');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/verify-email'));
    expect(api.callsTo('POST /api/v1/me/consents').map((call) => call.body)).toEqual([
      { documentType: 'TERMS', version: '2026-09-01', language: 'fr' },
      { documentType: 'PRIVACY', version: '2026-09-01', language: 'fr' },
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05', language: 'fr' },
    ]);
  });

  it('signs up with Google: the consent screen then collects the legal acceptance', async () => {
    const port = new FakeAuthPort();
    mockApi({
      'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS),
      // A fresh Google account: provisioned by /me with every document still to accept.
      'GET /api/v1/me': ok(
        meFixture({
          onboarding: NOT_ONBOARDED,
          requiredConsents: [{ documentType: 'TERMS', version: '2026-09-01' }],
        })
      ),
    });
    await renderWithProviders(<SignUpScreen />, { port });
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign up with Google' }));
    await fireEvent.changeText(await screen.findByTestId('google-email'), 'fresh@example.test');
    await fireEvent.changeText(screen.getByTestId('google-name'), 'Fresh Googler');
    await fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    await waitFor(() => expect(port.signInWithGoogle).toHaveBeenCalled());
    // No e-mail sign-up, no consents from this screen: the gate's consent screen does it.
    expect(port.signUp).not.toHaveBeenCalled();
    expect(useFlowLock.getState().lockedBy).toBeNull();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('shows the friendly error and releases the gate when sign-up fails', async () => {
    const port = new FakeAuthPort();
    port.signUp.mockRejectedValueOnce(new AuthError('auth/email-already-in-use'));
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    await renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });

    await fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka');
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maika@example.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

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
    await renderWithProviders(<ResetPasswordScreen />, { port });

    await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(screen.getByText('Enter your email address.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'nobody@example.test');
    await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByTestId('reset-sent')).toHaveTextContent(
      /If an account exists for nobody@example\.test/
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
  });

  it('shows other failures', async () => {
    const port = new FakeAuthPort();
    port.sendPasswordReset.mockRejectedValueOnce(new AuthError('auth/too-many-requests'));
    mockApi({});
    await renderWithProviders(<ResetPasswordScreen />, { port });
    await fireEvent.changeText(screen.getByLabelText('Email'), 'maika@example.test');
    await fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
    expect(
      await screen.findByText('Too many attempts. Wait a moment, then try again.')
    ).toBeOnTheScreen();
  });
});
