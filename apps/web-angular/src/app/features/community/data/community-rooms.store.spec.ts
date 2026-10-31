import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommunityService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { ROOM_VISITS_PREFIX } from '../../../core/auth/account-storage';
import { AuthService } from '../../../core/auth/auth.service';
import { GameContext } from '../../../core/game/game-context.service';
import { GamesStore } from '../../../shared/catalog/games.store';
import { fixtureRoom } from '../testing/community-fixtures';
import { CommunityRoomsStore } from './community-rooms.store';

describe('CommunityRoomsStore (web WF)', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let user: ReturnType<typeof signal<{ uid: string } | null>>;
  let store: CommunityRoomsStore;
  const posted = {
    id: 'p',
    authorHandle: 'maya',
    body: 'Hi',
    createdAt: '2026-10-30T10:00:00Z',
    mine: false,
  };

  beforeEach(() => {
    localStorage.clear();
    api = {
      listCommunityChannels: vi.fn(() =>
        of([
          fixtureRoom('yugioh', { lastPost: posted }),
          fixtureRoom('pokemon'),
          fixtureRoom('mtg', { lastPost: { ...posted, mine: true } }),
        ]),
      ),
    };
    user = signal<{ uid: string } | null>({ uid: 'fb-1' });
    TestBed.configureTestingModule({
      providers: [
        CommunityRoomsStore,
        { provide: CommunityService, useValue: api },
        { provide: AuthService, useValue: { user } },
        { provide: GameContext, useValue: { current: signal('pokemon') } },
        {
          provide: GamesStore,
          useValue: {
            games: signal([{ slug: 'yugioh' }, { slug: 'pokemon' }, { slug: 'mtg' }]),
            load: vi.fn(async () => true),
          },
        },
      ],
    });
    store = TestBed.inject(CommunityRoomsStore);
    TestBed.tick();
  });

  afterEach(() => localStorage.clear());

  it("reads the rooms of the browsed region, the browsed game's first", () => {
    store.load('americas-north');
    expect(api['listCommunityChannels']).toHaveBeenCalledWith(
      { region: 'americas-north' },
      'body',
      false,
      expect.anything(),
    );
    expect(store.status()).toBe('ready');
    expect(store.rooms().map((room) => room.game)).toEqual(['pokemon', 'yugioh', 'mtg']);
    // Asked again for the same region: no new read (the error's "Try again" forces one).
    store.load('americas-north');
    expect(api['listCommunityChannels']).toHaveBeenCalledTimes(1);
    store.load('americas-north', true);
    expect(api['listCommunityChannels']).toHaveBeenCalledTimes(2);
  });

  it('says the community is closed while publicChat is off, and errors otherwise', () => {
    api['listCommunityChannels'].mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errorCode: 'FEATURE_DISABLED', message: 'off', requestId: 'r' },
          }),
      ),
    );
    store.load('europe');
    expect(store.status()).toBe('disabled');
    api['listCommunityChannels'].mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    store.load('americas-south');
    expect(store.status()).toBe('error');
  });

  it('a room someone else posted in is unread until visited; the visit is kept per account', () => {
    store.load('americas-north');
    expect([...store.unread()]).toEqual(['americas-north-yugioh']);
    store.markVisited('americas-north-yugioh', posted.createdAt);
    expect(store.unread().size).toBe(0);
    expect(JSON.parse(localStorage.getItem(`${ROOM_VISITS_PREFIX}fb-1`) ?? '{}')).toEqual({
      'americas-north-yugioh': posted.createdAt,
    });
    // A newer post by someone else lights it up again.
    store.setLastPost('americas-north-yugioh', { ...posted, createdAt: '2026-10-30T11:00:00Z' });
    expect([...store.unread()]).toEqual(['americas-north-yugioh']);
    // Another account in this browser has its own visits.
    user.set({ uid: 'fb-2' });
    TestBed.tick();
    expect(store.visits()).toEqual({});
  });
});
