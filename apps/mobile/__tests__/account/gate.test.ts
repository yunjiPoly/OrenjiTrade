import { GATE_HOME, gateFor, guestMayOpen, homeFor, redirectFor } from '@/src/account/gate';

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

  it('lets a guest browse Home, Search and the public pages (stage R15)', () => {
    // The app opens on Home for a signed-out visitor, not on Sign in.
    expect(GATE_HOME.guest).toBe('/');
    expect(redirectFor('guest', [])).toBeNull();
    for (const tab of ['index', 'search', 'inventory', 'messages', 'profile', 'wishlist']) {
      // The member-only tabs stay in the tab bar and ask to sign in in place.
      expect(redirectFor('guest', ['(tabs)', tab])).toBeNull();
    }
    for (const allowed of [
      ['(auth)', 'sign-in'],
      ['(auth)', 'sign-up'],
      ['(auth)', 'reset-password'],
      ['cards', '[id]'],
      ['holders'],
      ['sets', '[id]'],
      ['regions', '[region]', '[code]'],
      ['binders', '[id]'],
      ['settings', 'appearance'],
      ['legal'],
      ['legal', '[key]'],
      ['+not-found'],
    ]) {
      expect(redirectFor('guest', allowed)).toBeNull();
      expect(guestMayOpen(allowed[0] ?? '', allowed[1])).toBe(true);
    }
  });

  it('sends a guest from a member-only screen to Sign in (stage R15)', () => {
    for (const member of [
      ['settings', 'account'],
      ['settings', 'index'],
      ['settings'],
      ['binders', 'new'],
      ['binders', 'edit'],
      ['collectors', '[id]'],
      ['collectors', '[id]', 'cards'],
      ['messages', '[id]'],
      ['community', '[slug]'],
      ['notifications'],
      ['items', 'new'],
      ['items', '[id]'],
      ['wishlist', 'new'],
      ['wishlist', 'edit'],
      ['report'],
      ['ratings', 'rate'],
      ['scan'],
      ['onboarding'],
      ['(account)', 'consent'],
    ]) {
      expect(redirectFor('guest', member)).toBe('/sign-in');
      expect(guestMayOpen(member[0] ?? '', member[1])).toBe(false);
    }
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
    // Stage R15: open to guests too (old links into Search › Binders).
    expect(redirectFor('guest', ['regions', '[region]', '[code]'])).toBeNull();
    // The card scan's screens, behind sign-in (the match is a signed-in call).
    expect(redirectFor('app', ['scan', 'review'])).toBeNull();
    expect(redirectFor('guest', ['scan', 'review'])).toBe('/sign-in');
    expect(redirectFor('app', ['onboarding'])).toBeNull();
    // Phase 7: reports and ratings (offers, trades and disputes left the phone, ADR 0018: their
    // old links are unmatched routes, which the not-found screen moves on to Messages).
    expect(redirectFor('app', ['report'])).toBeNull();
    expect(redirectFor('app', ['ratings', 'rate'])).toBeNull();
    expect(redirectFor('app', ['ratings', 'reference'])).toBeNull();
    expect(redirectFor('app', ['+not-found'])).toBeNull();
    expect(redirectFor('guest', ['+not-found'])).toBeNull();
    // Offers, trades, protected payments and disputes left the phone (ADR 0018); Premium, credits,
    // donations and their checkouts left the app (ADR 0019, stage F1): none is an app root any
    // more (an old link is an unmatched route, which the not-found screen moves on).
    for (const removed of [
      ['offers'],
      ['offers', '[id]'],
      ['trades', '[id]'],
      ['disputes', '[id]'],
      ['checkout', 'fake', '[ref]'],
      ['checkout', 'fake-billing', '[ref]'],
      ['checkout', 'fake-donation', '[ref]'],
      ['premium'],
      ['credits'],
      ['support'],
    ]) {
      expect(redirectFor('app', removed)).toBe('/');
    }
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
    // Stage R15: a signed-out visitor belongs on Home, as a guest.
    expect(homeFor('anonymous', false)).toBe('/');
    expect(homeFor('loading', false)).toBe('/');
  });
});
