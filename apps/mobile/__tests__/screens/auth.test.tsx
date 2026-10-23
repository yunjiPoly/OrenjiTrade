import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import ResetPasswordScreen from '@/app/(auth)/reset-password';
import SignInScreen from '@/app/(auth)/sign-in';
import SignUpScreen from '@/app/(auth)/sign-up';
import { useFlowLock } from '@/src/account/flowLock';
import { AuthError } from '@/src/auth/authErrors';
import { AGE_CONFIRMATION_LABEL_EN } from '@/src/features/legal/ageConfirmation';
import { useAppStore } from '@/src/store/useAppStore';

import { FakeAuthPort } from '../support/fakeAuthPort';
import { LEGAL_DOCUMENTS, NOT_ONBOARDED, meFixture } from '../support/fixtures';
import { mockLocales } from '../support/locales';
import { mockApi, noContent, ok, problem, type MockAnswer } from '../support/mockApi';
import { mockRouter, resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

beforeEach(() => {
  resetRouterMock();
  resetAppState();
  useAppStore.getState().reset();
  mockLocales('en-CA');
});

// The 18+ checkbox's name: English only since stage R12 (owner, 2026-10-20).
const AGE_LABEL = AGE_CONFIRMATION_LABEL_EN;
const BOTH_MISSING = 'Accept the documents and confirm your age to continue.';
const DOCUMENTS_MISSING = 'Accept every document to continue.';
const AGE_MISSING = 'Confirm that you are 18 or older to continue.';

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

  it('signs in with a simulated Google account against the emulator (the gate continues)', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/me': ok(meFixture()) });
    renderWithProviders(<SignInScreen />, { port });

    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    const dialog = await screen.findByTestId('google-dialog');
    expect(dialog).toHaveTextContent(/Simulated Google account/);
    // Validation of the simulated account first.
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    expect(screen.getByText('Enter the e-mail of the simulated Google account.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('google-email'), 'nope');
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    expect(screen.getByText('That email address does not look right.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('google-email'), 'Googler@Example.test');
    fireEvent.changeText(screen.getByTestId('google-name'), 'Gina Google');
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));

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
    renderWithProviders(<SignInScreen />, { port });
    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    fireEvent.changeText(await screen.findByTestId('google-email'), 'maika@example.test');
    fireEvent.changeText(screen.getByTestId('google-name'), 'Maïka Test');
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    await waitFor(() => expect(port.user?.providerIds).toEqual(['password', 'google.com']));
    expect(port.user?.uid).toBe('uid-maika@example.test');
  });

  it('explains a Google failure, and says nothing when the window was closed', async () => {
    const port = new FakeAuthPort();
    port.signInWithGoogle.mockRejectedValueOnce(
      new AuthError('auth/account-exists-with-different-credential')
    );
    mockApi({});
    renderWithProviders(<SignInScreen />, { port });
    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    fireEvent.changeText(await screen.findByTestId('google-email'), 'other@example.test');
    fireEvent.changeText(screen.getByTestId('google-name'), 'Other');
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent(
      /An account already exists for this email with a different sign-in method\./
    );

    // Closing the simulated-account dialog is a dismissal: no error.
    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    fireEvent.press(await screen.findByTestId('google-dialog-cancel'));
    await waitFor(() => expect(screen.queryByTestId('google-dialog')).toBeNull());
    expect(port.signInWithGoogle).toHaveBeenCalledTimes(1);

    port.signInWithGoogle.mockRejectedValueOnce(new AuthError('auth/popup-closed-by-user'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }));
    fireEvent.changeText(await screen.findByTestId('google-email'), 'other@example.test');
    fireEvent.changeText(screen.getByTestId('google-name'), 'Other');
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));
    await waitFor(() => expect(port.signInWithGoogle).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('sign-in-error')).toBeNull();
  });

  it('links to account creation, password reset and the legal pages', () => {
    mockApi({});
    renderWithProviders(<SignInScreen />, { port: new FakeAuthPort() });
    // Stage R12: the wordmark and its line.
    expect(screen.getByRole('header', { name: 'OrenjiTrade' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Find collectors in your region who own, trade or want the cards you care about.'
      )
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Create an account'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-up');
    fireEvent.press(screen.getByText('Forgot your password?'));
    expect(mockRouter.push).toHaveBeenCalledWith('/reset-password');
    fireEvent.press(screen.getByText('Terms, privacy and community guidelines'));
    expect(mockRouter.push).toHaveBeenCalledWith('/legal');
  });

  it('shows and hides the password', () => {
    mockApi({});
    renderWithProviders(<SignInScreen />, { port: new FakeAuthPort() });
    const field = screen.getByLabelText('Password');
    expect(field.props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });
});

describe('Sign up', () => {
  it('shows a skeleton while the legal documents load', async () => {
    // The answer is held back, then given. A request that never ended kept the read timeout of
    // the API client (20 s) armed after this file was done: its jest worker could not exit, and
    // every run printed "A worker process has failed to exit gracefully".
    let answer: (documents: MockAnswer) => void = () => undefined;
    const api = mockApi({
      'GET /api/v1/public/legal/documents': () =>
        new Promise<MockAnswer>((resolve) => {
          answer = resolve;
        }),
    });
    renderWithProviders(<SignUpScreen />, { port: new FakeAuthPort() });
    expect(screen.getByTestId('sign-up-legal-loading')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
    await waitFor(() => expect(api.callsTo('GET /api/v1/public/legal/documents')).toHaveLength(1));
    expect(screen.getByTestId('sign-up-legal-loading')).toBeOnTheScreen();

    answer(ok(LEGAL_DOCUMENTS));
    expect(await screen.findByRole('checkbox', { name: 'Accept all' })).toBeOnTheScreen();
    expect(screen.queryByTestId('sign-up-legal-loading')).toBeNull();
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

  it('keeps Create account disabled until every box is ticked, with one line saying what is missing', async () => {
    const port = new FakeAuthPort();
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });
    const submit = () => screen.getByRole('button', { name: 'Create account' });

    // Nothing ticked: both are missing.
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId('sign-up-blocker')).toHaveTextContent(BOTH_MISSING);
    fireEvent.press(submit());
    expect(port.signUp).not.toHaveBeenCalled();

    // The documents, not the age.
    fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId('sign-up-blocker')).toHaveTextContent(AGE_MISSING);

    // The age, and one document left out.
    fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    fireEvent.press(screen.getByRole('checkbox', { name: 'I accept the Privacy Policy' }));
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId('sign-up-blocker')).toHaveTextContent(DOCUMENTS_MISSING);

    // Everything ticked: enabled, no line.
    fireEvent.press(screen.getByRole('checkbox', { name: 'I accept the Privacy Policy' }));
    expect(submit()).toBeEnabled();
    expect(screen.queryByTestId('sign-up-blocker')).toBeNull();

    // The fields are checked when it is pressed.
    fireEvent.press(submit());
    expect(screen.getByText('Enter a display name.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your email address.')).toBeOnTheScreen();
    expect(screen.getByText('Choose a password.')).toBeOnTheScreen();
    expect(port.signUp).not.toHaveBeenCalled();
  });

  it('never ticks the 18+ confirmation with "Accept all" and keeps it out of the document card', async () => {
    mockApi({ 'GET /api/v1/public/legal/documents': ok(LEGAL_DOCUMENTS) });
    renderWithProviders(<SignUpScreen />, { port: new FakeAuthPort() });
    fireEvent.press(await screen.findByRole('checkbox', { name: 'Accept all' }));
    expect(screen.getByRole('checkbox', { name: 'I accept the Terms of Service' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'I accept the Privacy Policy' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: /I accept the Age confirmation/ })).toBeNull();
    const age = screen.getByRole('checkbox', { name: AGE_LABEL });
    expect(age).not.toBeChecked();
    // English only (owner, 2026-10-20): no French line under the confirmation.
    expect(screen.queryByText(/Je confirme/)).toBeNull();
    fireEvent.press(age);
    expect(age).toBeChecked();
    // Unticking "Accept all" leaves the age alone too.
    fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    expect(
      screen.getByRole('checkbox', { name: 'I accept the Terms of Service' })
    ).not.toBeChecked();
    expect(age).toBeChecked();
    expect(screen.getByTestId('sign-up-blocker')).toHaveTextContent(DOCUMENTS_MISSING);
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
    expect(screen.getByRole('checkbox', { name: 'I accept the Terms of Service' })).toBeChecked();
    // Every document accepted is not enough without the 18+ confirmation.
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
    fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));

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
    renderWithProviders(<SignUpScreen />, { port });
    // The document titles come from the French texts; the UI around them stays English.
    expect(
      await screen.findByRole('checkbox', { name: 'I accept the Conditions d’utilisation' })
    ).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Display name'), 'Nouvelle');
    fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
    fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/verify-email'));
    expect(api.callsTo('POST /api/v1/me/consents').map((call) => call.body)).toEqual([
      { documentType: 'TERMS', version: '2026-09-01', language: 'fr' },
      { documentType: 'PRIVACY', version: '2026-09-01', language: 'fr' },
      { documentType: 'AGE_CONFIRMATION', version: '2026-10-05', language: 'fr' },
    ]);
  });

  it('signs up with Google: Review our terms then collects the legal acceptance', async () => {
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
    renderWithProviders(<SignUpScreen />, { port });
    fireEvent.press(await screen.findByRole('button', { name: 'Sign up with Google' }));
    fireEvent.changeText(await screen.findByTestId('google-email'), 'fresh@example.test');
    fireEvent.changeText(screen.getByTestId('google-name'), 'Fresh Googler');
    fireEvent.press(screen.getByTestId('google-dialog-confirm'));
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
    renderWithProviders(<SignUpScreen />, { port });
    await screen.findByRole('checkbox', { name: 'Accept all' });

    fireEvent.changeText(screen.getByLabelText('Display name'), 'Maïka');
    fireEvent.changeText(screen.getByLabelText('Email'), 'maika@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'long-enough-pass');
    fireEvent.press(screen.getByRole('checkbox', { name: 'Accept all' }));
    fireEvent.press(screen.getByRole('checkbox', { name: AGE_LABEL }));
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

    // The sent state shows in place (stage R12).
    expect(screen.getByRole('header', { name: 'Check your inbox' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/sign-in');
    fireEvent.press(screen.getByRole('button', { name: 'Use another email' }));
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeOnTheScreen();
    expect(screen.queryByTestId('reset-sent')).toBeNull();
  });

  it('resends the link once 30 s passed, without revealing whether the account exists', async () => {
    jest.useFakeTimers();
    try {
      const port = new FakeAuthPort();
      port.sendPasswordReset
        .mockRejectedValueOnce(new AuthError('auth/user-not-found'))
        .mockRejectedValueOnce(new AuthError('auth/user-not-found'))
        .mockRejectedValueOnce(new AuthError('auth/too-many-requests'));
      mockApi({});
      renderWithProviders(<ResetPasswordScreen />, { port });
      fireEvent.changeText(screen.getByLabelText('Email'), 'nobody@example.test');
      fireEvent.press(screen.getByRole('button', { name: 'Send reset link' }));
      expect(await screen.findByTestId('reset-sent')).toBeOnTheScreen();

      // The email just left: "Resend in {n} s" for 30 s (the prompt's 38, as 39).
      expect(screen.getByRole('button', { name: 'Resend in 30 s' })).toBeDisabled();
      const waitSeconds = (seconds: number) => {
        for (let second = 0; second < seconds; second += 1) {
          act(() => jest.advanceTimersByTime(1000));
        }
      };
      waitSeconds(12);
      expect(screen.getByRole('button', { name: 'Resend in 18 s' })).toBeDisabled();
      waitSeconds(18);
      fireEvent.press(screen.getByRole('button', { name: 'Resend email' }));
      expect(await screen.findByTestId('reset-message')).toHaveTextContent(
        /If an account exists for nobody@example\.test, a new reset link is on its way\.$/
      );
      expect(port.sendPasswordReset).toHaveBeenCalledTimes(2);
      expect(port.sendPasswordReset).toHaveBeenLastCalledWith('nobody@example.test');
      expect(screen.getByRole('button', { name: 'Resend in 30 s' })).toBeDisabled();

      // Another failure says so, and the button is ready again at once.
      waitSeconds(30);
      fireEvent.press(screen.getByRole('button', { name: 'Resend email' }));
      expect(await screen.findByTestId('reset-message')).toHaveTextContent(
        /Too many attempts\. Wait a moment, then try again\.$/
      );
      expect(screen.getByRole('button', { name: 'Resend email' })).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
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
