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
    expect(redirectFor('app', ['cards', '[id]'])).toBeNull();
    expect(redirectFor('app', ['items', 'new'])).toBeNull();
    expect(redirectFor('app', ['items', '[id]'])).toBeNull();
    expect(redirectFor('app', ['binders', 'edit'])).toBeNull();
    expect(redirectFor('app', ['messages', '[id]'])).toBeNull();
    // Stage M9: the binders of a state or province, behind sign-in like the Map tab.
    expect(redirectFor('app', ['regions', '[region]', '[code]'])).toBeNull();
    expect(redirectFor('guest', ['regions', '[region]', '[code]'])).toBe('/sign-in');
    expect(redirectFor('app', ['onboarding'])).toBeNull();
    // Phase 7: reports and ratings (offers, trades and disputes left the phone, ADR 0018: their
    // old links are unmatched routes, which the not-found screen moves on to Messages).
    expect(redirectFor('app', ['report'])).toBeNull();
    expect(redirectFor('app', ['ratings', 'rate'])).toBeNull();
    expect(redirectFor('app', ['ratings', 'reference'])).toBeNull();
    expect(redirectFor('app', ['+not-found'])).toBeNull();
    expect(redirectFor('guest', ['+not-found'])).toBeNull();
    // Phase 10: the Premium and donation checkouts, Premium, credits and donations.
    expect(redirectFor('app', ['checkout', 'fake-billing', '[ref]'])).toBeNull();
    expect(redirectFor('app', ['checkout', 'fake-donation', '[ref]'])).toBeNull();
    expect(redirectFor('app', ['premium'])).toBeNull();
    expect(redirectFor('app', ['credits'])).toBeNull();
    expect(redirectFor('app', ['support'])).toBeNull();
    expect(redirectFor('guest', ['checkout', 'fake-billing', '[ref]'])).toBe('/sign-in');
    expect(redirectFor('onboarding', ['premium'])).toBe('/onboarding');
    expect(redirectFor('guest', ['report'])).toBe('/sign-in');
    // Signed out: the inventory screens, profiles and conversations send the visitor to sign in.
    expect(redirectFor('guest', ['items', 'new'])).toBe('/sign-in');
    expect(redirectFor('guest', ['collectors', '[id]'])).toBe('/sign-in');
    expect(redirectFor('guest', ['messages', '[id]'])).toBe('/sign-in');
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
