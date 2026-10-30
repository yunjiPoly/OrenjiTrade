import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogService, ProfileService } from '@orenji/api-client';
import { Subject, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SessionService, SessionStatus } from '../auth/session.service';
import { GameContext, browsableGames, resolveGame } from './game-context.service';

const BROWSABLE = new Set(['yugioh', 'pokemon', 'mtg']);

describe("resolveGame (the phone's order, stage G; web stage WD)", () => {
  const base = { picked: null, stored: null, profileGames: [], browsable: BROWSABLE };

  it('takes a pick first, then the kept game, then the profile, then Yu-Gi-Oh!', () => {
    expect(resolveGame({ ...base, picked: 'mtg', stored: 'pokemon' })).toBe('mtg');
    expect(resolveGame({ ...base, stored: 'pokemon', profileGames: ['mtg'] })).toBe('pokemon');
    expect(resolveGame({ ...base, profileGames: ['onepiece', 'mtg'] })).toBe('mtg');
    expect(resolveGame(base)).toBe('yugioh');
  });

  it('passes over a game that cannot be browsed (hidden, or without cards)', () => {
    expect(resolveGame({ ...base, picked: 'onepiece', stored: 'riftbound' })).toBe('yugioh');
    expect(resolveGame({ ...base, browsable: new Set(['pokemon']), stored: 'onepiece' })).toBe(
      'pokemon',
    );
  });

  it('before the games answered, takes a pick or a kept game as it is, never the profile', () => {
    expect(resolveGame({ ...base, browsable: null, stored: 'riftbound' })).toBe('riftbound');
    expect(resolveGame({ ...base, browsable: null, profileGames: ['mtg'] })).toBe('yugioh');
  });

  it('browses only ACTIVE games whose catalogue holds a card', () => {
    expect(browsableGames(null)).toBeNull();
    expect([
      ...browsableGames([
        { slug: 'yugioh', status: 'ACTIVE', hasCards: true },
        { slug: 'onepiece', status: 'ACTIVE', hasCards: false },
        { slug: 'mtg', status: 'HIDDEN', hasCards: true },
      ] as never)!,
    ]).toEqual(['yugioh']);
  });
});

describe('GameContext', () => {
  const status = signal<SessionStatus>('anonymous');
  const me = signal<{ id: string } | null>(null);
  const user = signal<{ uid: string } | null>(null);

  beforeEach(() => {
    localStorage.clear();
    status.set('anonymous');
    me.set(null);
    user.set(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: SessionService, useValue: { status, me } },
        { provide: AuthService, useValue: { user, changes$: new Subject() } },
        {
          provide: CatalogService,
          useValue: {
            listGames: () =>
              of([
                { slug: 'yugioh', status: 'ACTIVE', hasCards: true },
                { slug: 'pokemon', status: 'ACTIVE', hasCards: true },
                { slug: 'onepiece', status: 'ACTIVE', hasCards: false },
              ]),
          },
        },
        { provide: ProfileService, useValue: { getMyProfile: () => of({ games: ['pokemon'] }) } },
      ],
    });
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it("keeps a guest's pick in this browser, and refuses a game without cards", async () => {
    const context = TestBed.inject(GameContext);
    TestBed.tick();
    await settle();
    expect(context.current()).toBe('yugioh');
    expect(context.select('onepiece')).toBe(false);
    expect(context.select('Pokemon')).toBe(true);
    expect(context.current()).toBe('pokemon');
    expect(localStorage.getItem('orenji.game.guest')).toBe('pokemon');
    expect(context.options().find((o) => o.game.slug === 'onepiece')?.available).toBe(false);
  });

  it("signed in, reads the account's own kept game, else the first browsable profile game", async () => {
    localStorage.setItem('orenji.game.guest', 'yugioh');
    const context = TestBed.inject(GameContext);
    TestBed.tick();
    await settle();
    user.set({ uid: 'fb-u1' });
    me.set({ id: 'u1' });
    status.set('ready');
    TestBed.tick();
    await settle();
    TestBed.tick();
    expect(context.current()).toBe('pokemon');

    localStorage.setItem('orenji.game.fb-u2', 'yugioh');
    user.set({ uid: 'fb-u2' });
    me.set({ id: 'u2' });
    TestBed.tick();
    await settle();
    expect(context.current()).toBe('yugioh');
  });
  it("keys the kept game by the Firebase uid, never the API's account id (WD review P4)", async () => {
    // A key of the old form (the account id other members see) is moved, then removed.
    localStorage.setItem('orenji.game.acc-3', 'pokemon');
    const context = TestBed.inject(GameContext);
    TestBed.tick();
    await settle();
    user.set({ uid: 'fb-u3' });
    me.set({ id: 'acc-3' });
    status.set('ready');
    TestBed.tick();
    await settle();
    expect(context.current()).toBe('pokemon');
    expect(localStorage.getItem('orenji.game.acc-3')).toBeNull();
    expect(localStorage.getItem('orenji.game.fb-u3')).toBe('pokemon');
    context.select('yugioh');
    expect(localStorage.getItem('orenji.game.fb-u3')).toBe('yugioh');
    expect(Object.keys(localStorage).filter((key) => key.includes('acc-3'))).toEqual([]);
  });
});
