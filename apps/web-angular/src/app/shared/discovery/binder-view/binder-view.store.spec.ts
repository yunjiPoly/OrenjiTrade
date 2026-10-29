import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CollectorsService, PublicBindersService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import {
  BinderViewStore,
  binderLimitMessage,
  isBinderSort,
  updatedLabel,
} from './binder-view.store';

const BINDER = {
  id: 'b1',
  name: 'Hand traps',
  owner: { handle: 'maya_k' },
  games: ['yugioh'],
  ownerRating: { average: 4.9, count: 12 },
};

describe('BinderViewStore (decision 14: a view is spent only on an explicit open)', () => {
  let getPublicBinder: ReturnType<typeof vi.fn>;
  let listItems: ReturnType<typeof vi.fn>;
  let getCollector: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getCollector = vi.fn(() => of({ rating: { average: 1, count: 1 } }));
    getPublicBinder = vi.fn(() => of(BINDER));
    listItems = vi.fn(() => of({ items: [{ id: 'i1' }], page: 0, totalPages: 2 }));
    TestBed.configureTestingModule({
      providers: [
        BinderViewStore,
        {
          provide: PublicBindersService,
          useValue: { getPublicBinder, listPublicBinderItems: listItems },
        },
        // The rating comes with the binder: no profile read (its city, a counted view).
        { provide: CollectorsService, useValue: { getCollector } },
        {
          provide: AuthService,
          useValue: { ready: () => Promise.resolve(), isAuthenticated: signal(true) },
        },
      ],
    });
  });

  it('reads the binder once on open; its cards, search, sort and "Load more" never read it again', async () => {
    const store = TestBed.inject(BinderViewStore);
    await store.open('b1');
    expect(getPublicBinder).toHaveBeenCalledTimes(1);
    expect(store.binder()?.name).toBe('Hand traps');
    expect(listItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'b1', page: 0, size: 24, sort: 'recent' }),
      'body',
      false,
      expect.anything(),
    );
    store.setFilters('ash', 'price');
    store.loadMore();
    store.retryItems();
    expect(listItems).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'ash', sort: 'price' }),
      'body',
      false,
      expect.anything(),
    );
    expect(getPublicBinder).toHaveBeenCalledTimes(1);
    expect(store.rating()?.average).toBe(4.9);
    expect(getCollector).not.toHaveBeenCalled();
  });

  it('turns a 429 LIMIT_REACHED into the limit state with its time, and a 404 into not found', async () => {
    getPublicBinder.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 429,
            error: {
              errorCode: 'LIMIT_REACHED',
              limitKey: 'binder.views.per_day',
              limit: 30,
              resetsAt: '2026-10-30T00:00:00Z',
            },
          }),
      ),
    );
    const store = TestBed.inject(BinderViewStore);
    await store.open('b1');
    const state = store.state();
    expect(state.kind).toBe('limit');
    expect(state.kind === 'limit' && state.info.limit).toBe(30);
    getPublicBinder.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })));
    await store.open('b2');
    expect(store.state().kind).toBe('not-found');
    expect(listItems).not.toHaveBeenCalled();
  });
});

describe('binder view words', () => {
  it('says the limit as the spec does, with no plan and no price', () => {
    const message = binderLimitMessage({
      limitKey: 'binder.views.per_day',
      limit: 30,
      used: 30,
      resetsAt: null,
      requestId: null,
    });
    expect(message).toBe(
      "You've opened 30 public binders today. Every collector has the same limits. More tomorrow.",
    );
    expect(
      binderLimitMessage({
        limitKey: '',
        limit: 30,
        used: 30,
        resetsAt: '2026-10-30T00:00:00Z',
        requestId: null,
      }),
    ).toMatch(/More (today|tomorrow|on [A-Z][a-z]+\.? \d+) at \d/);
  });

  it('says "today" or "tomorrow" by the local day of the reset, with one final period', () => {
    const info = { limitKey: '', limit: 5, used: 5, requestId: null };
    const at = (hours: number) => new Date(2026, 9, 29, hours, 0).toISOString();
    const morning = new Date(2026, 9, 29, 9);
    const today = binderLimitMessage({ ...info, resetsAt: at(20) }, 'en-CA', morning);
    expect(today).toMatch(/More today at 8:00\sp\.m\.$/);
    expect(today).not.toContain('..');
    const tomorrow = binderLimitMessage(
      { ...info, resetsAt: new Date(2026, 9, 30, 20).toISOString() },
      'en-US',
      morning,
    );
    expect(tomorrow).toMatch(/More tomorrow at 8:00\sPM\.$/);
  });

  it('says when a binder was updated', () => {
    const now = new Date(2026, 9, 29, 12);
    expect(updatedLabel(new Date(2026, 9, 29, 8).toISOString(), now)).toBe('Updated today');
    expect(updatedLabel(new Date(2026, 9, 28, 8).toISOString(), now)).toBe('Updated yesterday');
    expect(updatedLabel(new Date(2026, 9, 26, 8).toISOString(), now)).toBe('Updated 3 days ago');
    expect(updatedLabel(null, now)).toBe('');
  });

  it('knows the three sorts of the pill', () => {
    expect(['recent', 'name', 'price'].every(isBinderSort)).toBe(true);
    expect(isBinderSort('cheapest')).toBe(false);
  });
});
