import { GATE_HOME, gateFor, homeFor, redirectFor } from '@/src/account/gate';

describe('auth gate', () => {
  it('maps every account status to a gate', () => {
    expect(gateFor('loading', false)).toBe('boot');
    expect(gateFor('anonymous', false)).toBe('guest');
    expect(gateFor('consent-required', false)).toBe('consent');
    expect(gateFor('suspended', false)).toBe('suspended');
    expect(gateFor('deletion-pending', false)).toBe('suspended');
    expect(gateFor('error', false)).toBe('error');
    expect(gateFor('ready', true)).toBe('onboarding');
    expect(gateFor('ready', false)).toBe('app');
  });

  it('keeps signed-out visitors in the auth group', () => {
    expect(redirectFor('guest', ['(tabs)'])).toBe('/sign-in');
    expect(redirectFor('guest', ['settings', 'account'])).toBe('/sign-in');
    expect(redirectFor('guest', ['(auth)', 'sign-up'])).toBeNull();
    expect(redirectFor('guest', [])).toBe('/sign-in');
  });

  it('lets legal pages and the not-found screen through from every gate', () => {
    for (const gate of ['guest', 'consent', 'suspended', 'error', 'onboarding', 'app'] as const) {
      expect(redirectFor(gate, ['legal', '[key]'])).toBeNull();
      expect(redirectFor(gate, ['+not-found'])).toBeNull();
    }
  });

  it('sends account states to their screen only', () => {
    expect(redirectFor('consent', ['(tabs)', 'profile'])).toBe('/consent');
    expect(redirectFor('consent', ['(account)', 'consent'])).toBeNull();
    expect(redirectFor('consent', ['(account)', 'suspended'])).toBe('/consent');
    expect(redirectFor('suspended', ['(tabs)'])).toBe('/suspended');
    expect(redirectFor('suspended', ['(account)', 'suspended'])).toBeNull();
    expect(redirectFor('error', ['onboarding'])).toBe('/unavailable');
    expect(redirectFor('error', ['(account)', 'unavailable'])).toBeNull();
  });

  it('holds unfinished profiles in onboarding (verification screen allowed)', () => {
    expect(redirectFor('onboarding', ['(tabs)'])).toBe('/onboarding');
    expect(redirectFor('onboarding', ['(auth)', 'sign-in'])).toBe('/onboarding');
    expect(redirectFor('onboarding', ['onboarding'])).toBeNull();
    expect(redirectFor('onboarding', ['(account)', 'verify-email'])).toBeNull();
  });

  it('opens the app to onboarded collectors and moves them out of the auth group', () => {
    expect(redirectFor('app', ['(auth)', 'sign-in'])).toBe('/');
    expect(redirectFor('app', ['(account)', 'consent'])).toBe('/');
    expect(redirectFor('app', ['(tabs)', 'profile'])).toBeNull();
    expect(redirectFor('app', ['settings', 'location'])).toBeNull();
    expect(redirectFor('app', ['collectors', '[id]'])).toBeNull();
    expect(redirectFor('app', ['onboarding'])).toBeNull();
  });

  it('never moves while booting or while a multi-step flow holds the lock', () => {
    expect(redirectFor('boot', ['(tabs)'])).toBeNull();
    expect(redirectFor('consent', ['(auth)', 'sign-up'], true)).toBeNull();
  });

  it('knows where each state belongs', () => {
    expect(homeFor('ready', false)).toBe(GATE_HOME.app);
    expect(homeFor('ready', true)).toBe('/onboarding');
    expect(homeFor('anonymous', false)).toBe('/sign-in');
    expect(homeFor('loading', false)).toBe('/');
  });
});
