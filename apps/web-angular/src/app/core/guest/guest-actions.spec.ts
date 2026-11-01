import {
  GUEST_ASK_TITLES,
  GUEST_COPY,
  askTitle,
  cardSubject,
  finishedByPage,
  guestPlace,
  isStepPage,
  ownerQuery,
  personSubject,
  samePage,
  wishSubject,
} from './guest-actions';

describe("a guest's actions (spec 14, decision 4)", () => {
  it("titles the dialog with what the guest tried (the spec's four, and two more)", () => {
    expect(askTitle({ kind: 'message', listing: { itemId: 'i' } })).toBe(
      'Sign in to message this collector',
    );
    expect(
      askTitle({ kind: 'have', wishId: 'w', card: { cardId: 'c', name: 'Ash Blossom' } }),
    ).toBe('Sign in to tell them you have it');
    expect(askTitle({ kind: 'profile', listing: { binderId: 'b' } })).toBe(
      'Sign in to see collector profiles',
    );
    expect(askTitle({ kind: 'wish', cardId: 'c' })).toBe('Sign in to save your wishes');
    expect(GUEST_ASK_TITLES.report).toBe('Sign in to report this collector');
    expect(GUEST_ASK_TITLES.add).toBe('Sign in to add your cards');
  });

  it('names the listing, never a collector, to find its owner after signing in', () => {
    expect(ownerQuery({ kind: 'message', listing: { itemId: 'i-1' } })).toEqual({ itemId: 'i-1' });
    expect(ownerQuery({ kind: 'profile', listing: { wishId: 'w-1' } })).toEqual({ wishId: 'w-1' });
    expect(ownerQuery({ kind: 'have', wishId: 'w-2', card: { cardId: 'c', name: 'Ash' } })).toEqual(
      { wishId: 'w-2' },
    );
    expect(ownerQuery({ kind: 'report', binderId: 'b-1' })).toEqual({ binderId: 'b-1' });
    expect(ownerQuery({ kind: 'wish', cardId: 'c' })).toBeNull();
    expect(finishedByPage({ kind: 'add', cardId: 'c' })).toBe(true);
    expect(finishedByPage({ kind: 'wish', cardId: 'c' })).toBe(false);
  });

  it("finishes on the guest's page only, never on a sign-in step or the welcome", () => {
    expect(samePage('/cards/c-1?printing=p', '/cards/c-1?printing=p#holders')).toBe(true);
    expect(samePage('/cards/c-1', '/cards/c-2')).toBe(false);
    // A page that merged its parameters in another order is the same page; another value is not.
    expect(
      samePage(
        '/search?tab=binders&open=b-1&game=yugioh',
        '/search?game=yugioh&tab=binders&open=b-1',
      ),
    ).toBe(true);
    expect(samePage('/search?tab=binders&game=yugioh', '/search?tab=binders&game=pokemon')).toBe(
      false,
    );
    expect(samePage('/search?tab=binders', '/search?tab=binders&open=b-1')).toBe(false);
    expect(isStepPage('/auth/sign-in?returnUrl=%2F')).toBe(true);
    expect(isStepPage('/onboarding')).toBe(true);
    expect(isStepPage('/authors')).toBe(false);
    expect(isStepPage('/')).toBe(false);
  });

  it("names a guest's buttons with their visible words first (SC 2.5.3, WG review A6)", () => {
    expect(GUEST_COPY.haveLabel('Ash Blossom')).toBe('I have it: Ash Blossom. Needs an account');
    expect(GUEST_COPY.messageLabel('Ash Blossom')).toMatch(/^Message /);
  });

  it('shows places only: "A collector · Quebec · $24.00", "Wanted by a collector · Ontario"', () => {
    const place = guestPlace({ subdivisionName: 'Quebec', countryName: 'Canada' });
    expect(place).toBe('Quebec');
    expect(guestPlace({ subdivisionName: '', countryName: 'Canada' })).toBe('Canada');
    expect(guestPlace(null)).toBe('');
    expect(cardSubject({ name: 'Infinite Impermanence' }, place, '$24.00').line).toBe(
      'A collector · Quebec · $24.00',
    );
    expect(cardSubject({ name: 'Ash' }, place).line).toBe('A collector · Quebec');
    expect(wishSubject({ name: 'Ash' }, 'Ontario').line).toBe('Wanted by a collector · Ontario');
    expect(personSubject('Quebec')).toEqual({
      kind: 'person',
      title: 'A collector',
      line: 'Quebec',
    });
  });
});
