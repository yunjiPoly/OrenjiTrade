import { LiveAnnouncer } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError } from '../../../core/http/api-error';
import { item } from '../testing/fixtures';
import {
  INLINE_SAVED,
  InventoryActions,
  UNDO_WINDOW_MS,
  binderGameError,
  restoreMessage,
} from './inventory-actions.service';
import { InventoryStore, RestoreOutcome } from './inventory.store';

function error(errorCode: string): ApiError {
  return new ApiError({ errorCode, message: 'x', requestId: null, status: 409, fieldErrors: {} });
}

describe('binder game errors (stage G 409s, spec 9.12)', () => {
  it('says both 409s in plain words', () => {
    expect(binderGameError(error('BINDER_GAME_MISMATCH'), 'Yu-Gi-Oh!')).toBe(
      'Only Yu-Gi-Oh! cards can go in this binder.',
    );
    expect(binderGameError(error('BINDER_GAME_LOCKED'), 'Yu-Gi-Oh!')).toBe(
      "This binder already has Yu-Gi-Oh! cards, so its game can't change.",
    );
    expect(binderGameError(error('BINDER_GAME_LOCKED'), null)).toBe(
      "This binder already has cards, so its game can't change.",
    );
    expect(binderGameError(error('BINDER_GAME_MISMATCH'), null)).toBe(
      "Only cards of this binder's game can go in it.",
    );
    expect(binderGameError(error('CONFLICT'), 'Yu-Gi-Oh!')).toBeNull();
  });

  it("keeps an Undo for the server's 10 minutes", () => {
    expect(UNDO_WINDOW_MS).toBe(600_000);
  });
});

describe("an Undo's words (F1)", () => {
  it('names the cards back, the ones past 10 minutes, and asks to try again for the rest', () => {
    expect(restoreMessage({ restored: 3, gone: [], waiting: [], retryAfterSeconds: null }, 3)).toEqual(
      { title: '3 cards restored', sub: null, tone: 'success' },
    );
    expect(
      restoreMessage({ restored: 97, gone: [], waiting: ['x', 'y'], retryAfterSeconds: 40 }, 99),
    ).toEqual({
      title: '97 cards restored',
      sub: '2 cards not restored yet. Try again in 40 s.',
      tone: 'info',
    });
    expect(
      restoreMessage({ restored: 0, gone: [], waiting: ['x'], retryAfterSeconds: null }, 1),
    ).toEqual({ title: '1 card not restored yet', sub: 'Try again in a moment.', tone: 'error' });
    expect(restoreMessage({ restored: 1, gone: ['z'], waiting: [], retryAfterSeconds: null }, 2)).toEqual(
      { title: 'Card restored', sub: '1 card could no longer be restored.', tone: 'success' },
    );
    expect(restoreMessage({ restored: 0, gone: ['z'], waiting: [], retryAfterSeconds: null }, 1).title).toBe(
      'This card can no longer be restored.',
    );
  });
});

describe('InventoryActions', () => {
  let actions: InventoryActions;
  let toasts: ToastService;
  let store: {
    items: () => ReturnType<typeof item>[];
    bulk: ReturnType<typeof vi.fn>;
    restoreItems: ReturnType<typeof vi.fn>;
    binders: () => [];
    bindersById: () => Map<string, unknown>;
  };
  let announce: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = {
      items: () => [item('a'), item('b'), item('c')],
      bulk: vi.fn(() => Promise.resolve({ updated: 2, skipped: [{ itemId: 'c', reason: 'NOT_FOUND' }] })),
      restoreItems: vi.fn(),
      binders: () => [],
      bindersById: () => new Map(),
    };
    announce = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      providers: [
        InventoryActions,
        { provide: InventoryStore, useValue: store },
        { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
        { provide: LiveAnnouncer, useValue: { announce } },
      ],
    });
    actions = TestBed.inject(InventoryActions);
    toasts = TestBed.inject(ToastService);
  });

  function lastToast() {
    return toasts.toasts().at(-1)!;
  }

  it('Undo of a bulk delete restores only the cards it deleted (M11)', async () => {
    store.restoreItems.mockResolvedValue({
      restored: ['a', 'b'],
      gone: [],
      waiting: [],
      retryAfterSeconds: null,
    } satisfies RestoreOutcome);
    await actions.bulk({ kind: 'delete' }, ['a', 'b', 'c']);
    expect(lastToast().action).toBe('Undo');
    expect(await actions.undoLast()).toBe(true);
    expect(store.restoreItems).toHaveBeenCalledWith(['a', 'b'], expect.anything());
    expect(lastToast().title).toBe('2 cards restored');
    // Once done, Ctrl/Cmd+Z has nothing left to undo.
    expect(actions.hasUndo()).toBe(false);
  });

  it('keeps Undo, and Ctrl/Cmd+Z, for the cards a 429 left waiting (F1)', async () => {
    store.restoreItems
      .mockResolvedValueOnce({
        restored: ['a'],
        gone: [],
        waiting: ['b'],
        retryAfterSeconds: 30,
      } satisfies RestoreOutcome)
      .mockResolvedValueOnce({
        restored: ['b'],
        gone: [],
        waiting: [],
        retryAfterSeconds: null,
      } satisfies RestoreOutcome);
    await actions.bulk({ kind: 'delete' }, ['a', 'b', 'c']);
    await actions.undoLast();
    expect(lastToast()).toEqual(
      expect.objectContaining({
        title: 'Card restored',
        sub: '1 card not restored yet. Try again in 30 s.',
        action: 'Try again',
      }),
    );
    expect(actions.hasUndo()).toBe(true);
    await actions.undoLast();
    expect(store.restoreItems).toHaveBeenLastCalledWith(['b'], expect.anything());
    expect(lastToast().title).toBe('Card restored');
    expect(actions.hasUndo()).toBe(false);
  });

  it('runs an Undo once, from the toast or from Ctrl/Cmd+Z', async () => {
    store.restoreItems.mockResolvedValue({
      restored: ['a', 'b'],
      gone: [],
      waiting: [],
      retryAfterSeconds: null,
    } satisfies RestoreOutcome);
    await actions.bulk({ kind: 'delete' }, ['a', 'b', 'c']);
    const undo = lastToast();
    toasts.act(undo.id);
    await actions.undoLast();
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.restoreItems).toHaveBeenCalledTimes(1);
  });

  it('marks the dock busy only once the delete is confirmed', async () => {
    const started = vi.fn();
    await actions.bulk({ kind: 'delete' }, ['a'], started);
    expect(started).toHaveBeenCalledTimes(1);
    expect(store.bulk).toHaveBeenCalled();
  });

  it('says "Saved" to a screen reader after an inline save (spec 9.4, F8)', async () => {
    expect(await actions.inline('price', () => Promise.resolve())).toBe(true);
    expect(announce).toHaveBeenCalledWith(INLINE_SAVED.price, 'polite');
    expect(INLINE_SAVED.price).toBe('Price saved');
    announce.mockClear();
    expect(await actions.inline('copies', () => Promise.reject(error('CONFLICT')))).toBe(false);
    expect(announce).not.toHaveBeenCalled();
  });
});
