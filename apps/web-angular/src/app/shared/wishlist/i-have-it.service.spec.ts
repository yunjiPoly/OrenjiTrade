import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  BindersService,
  InventoryItemResponse,
  InventoryItemResponseVisibilityEnum as Visibility,
  InventoryService,
} from '@orenji/api-client';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ChatDrawer } from '../messaging/chat-drawer.service';
import { IHaveIt, iHaveItDraft, iHaveItLabel, pickPublicCopy } from './i-have-it.service';

function copy(
  id: string,
  options: {
    printing?: string;
    rarity?: string;
    visibility?: Visibility;
    effectivePublic?: boolean;
    binder?: string;
    createdAt?: string;
  } = {},
): InventoryItemResponse {
  return {
    id,
    printing: { id: options.printing ?? 'p-any', rarity: options.rarity ?? 'Common' },
    visibility: options.visibility ?? Visibility.Public,
    effectivePublic: options.effectivePublic ?? true,
    binder: options.binder ? { id: options.binder, name: 'B' } : undefined,
    createdAt: options.createdAt ?? '2026-10-01T00:00:00Z',
  } as InventoryItemResponse;
}

describe('"I have it" (spec 5.2 and 11)', () => {
  const wish = { cardId: 'card-1', name: 'Ash Blossom', printingId: 'p-1', rarity: 'Ultra Rare' };

  it('pins a public copy only: the wished printing, then the rarity, then the newest', () => {
    const cores = new Set(['core']);
    expect(
      pickPublicCopy(
        [copy('newest', { createdAt: '2026-10-20T00:00:00Z' }), copy('printing', { printing: 'p-1' })],
        wish,
        cores,
      )?.id,
    ).toBe('printing');
    expect(pickPublicCopy([copy('a'), copy('rare', { rarity: 'Ultra Rare' })], wish, cores)?.id).toBe(
      'rare',
    );
    expect(
      pickPublicCopy(
        [copy('old'), copy('new', { createdAt: '2026-10-20T00:00:00Z' })],
        { cardId: 'card-1', name: 'x' },
        cores,
      )?.id,
    ).toBe('new');
    // Never a private copy, one hidden from search, or one sold with a deck core.
    expect(
      pickPublicCopy(
        [
          copy('private', { printing: 'p-1', visibility: Visibility.Private, effectivePublic: false }),
          copy('hidden', { printing: 'p-1', effectivePublic: false }),
          copy('in-core', { printing: 'p-1', binder: 'core' }),
        ],
        wish,
        cores,
      ),
    ).toBeNull();
  });

  it('words the draft and the button', () => {
    expect(iHaveItDraft('Ash Blossom')).toBe('Hi! I have Ash Blossom.');
    expect(iHaveItLabel('Ash Blossom', 'theo.duels')).toBe('I have Ash Blossom. Message theo.duels');
    expect(iHaveItLabel('Ash Blossom', null)).toBe('I have Ash Blossom');
  });

  it('opens the chat with the draft and the public copy as its card', async () => {
    const message = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { isAuthenticated: signal(true) } },
        {
          provide: InventoryService,
          useValue: {
            listInventoryItems: vi.fn(() => of({ items: [copy('mine', { printing: 'p-1' })] })),
          },
        },
        { provide: BindersService, useValue: { listMyBinders: () => of([]) } },
        { provide: ChatDrawer, useValue: { message } },
      ],
    });
    await TestBed.inject(IHaveIt).offer('wisher', wish);
    expect(message).toHaveBeenCalledWith(
      { recipientId: 'wisher', subjectItemId: 'mine', draft: 'Hi! I have Ash Blossom.' },
      undefined,
    );
  });
});
