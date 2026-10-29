import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CollectorsService,
  ConversationSubject,
  ConversationSummary,
  InventoryService,
  MessageResponse,
  PublicBindersService,
} from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { DealPanelComponent } from './deal-panel.component';

function subject(overrides: Partial<ConversationSubject> = {}): ConversationSubject {
  return {
    kind: 'CARD',
    id: 'item-1',
    ownerId: 'seller',
    name: 'Ash Blossom & Joyous Spring',
    printingCode: 'LAVD-EN008',
    rarity: 'Ultra Rare',
    cardId: 'card-1',
    printingId: 'print-1',
    askingPriceText: '85% TCG',
    sold: false,
    listed: true,
    copies: 2,
    ...overrides,
  } as ConversationSubject;
}

function chat(other: string, s: ConversationSubject | undefined): ConversationSummary {
  return {
    id: 'c1',
    other: {
      id: `${other}-id`,
      handle: other,
      displayName: other,
      onlineStatus: 'ONLINE',
      place: {
        countryCode: 'CA',
        countryName: 'Canada',
        subdivisionCode: 'CA-ON',
        subdivisionName: 'Ontario',
        label: 'Ontario, Canada',
      },
    },
    unreadCount: 0,
    muted: false,
    archived: false,
    createdAt: '2026-10-20T10:00:00Z',
    subject: s,
  } as ConversationSummary;
}

function item(id: string, name: string, price: string) {
  return {
    id,
    card: { id: `card-${id}`, name, game: 'yugioh' },
    printing: {
      id: `p-${id}`,
      images: [{ kind: 'FRONT', url: `/api/v1/public/card-images/${id}` }],
    },
    askingPriceText: price,
  };
}

describe('DealPanelComponent (web WC, spec 10.4)', () => {
  let fixture: ComponentFixture<DealPanelComponent>;
  let element: HTMLElement;
  let listCollectorInventory: ReturnType<typeof vi.fn>;
  let getCollector: ReturnType<typeof vi.fn>;

  async function render(inputs: Record<string, unknown>): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CollectorsService, useValue: { getCollector } },
        {
          provide: InventoryService,
          useValue: {
            getInventoryItem: vi.fn(() =>
              of({
                id: 'item-1',
                visibility: 'PUBLIC',
                effectivePublic: true,
                binder: { id: 'b1', name: 'Trade binder' },
              }),
            ),
          },
        },
        { provide: PublicBindersService, useValue: { listCollectorInventory } },
      ],
    });
    fixture = TestBed.createComponent(DealPanelComponent);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    getCollector = vi.fn(() =>
      of({
        rating: { average: 4.9, count: 14 },
        memberSince: '2024-03-01T00:00:00Z',
        location: { city: 'Toronto', label: 'Ontario, Canada' },
      }),
    );
    listCollectorInventory = vi.fn(() =>
      of({
        items: [
          item('item-1', 'Ash Blossom & Joyous Spring', '85% TCG'),
          item('i2', 'Infinite Impermanence', '$18'),
          item('i3', 'Effect Veiler', '$4.50'),
          item('i4', 'Called by the Grave', '$4'),
          item('i5', 'Maxx “C”', '$18'),
        ],
        totalItems: 40,
      }),
    );
  });

  it('shows the buyer how deals work, the seller’s rating and place, and More from without counts', async () => {
    await render({ conversation: chat('duelist.jp', subject()), side: 'buying', selfId: 'buyer' });
    const text = element.textContent ?? '';
    expect(text).toContain('This chat is about');
    expect(text).toContain('85% TCG');
    expect(text).toContain('How deals work here');
    expect(text).toContain('The buyer pays by e-Transfer');
    expect(text).toContain('OrenjiTrade never holds the money and does not protect payments.');
    expect(text).toContain('★4.9 · 14 ratings');
    expect(text).toContain('Ontario, Canada');
    expect(text).toContain('Member since 2024');
    // Places only: the profile's city never shows here (ADR 0017).
    expect(text).not.toContain('Toronto');

    const tiles = [
      ...element.querySelectorAll<HTMLButtonElement>('[data-testid="more-from"] .tile'),
    ];
    // Four tiles, the chat's own card left out, and no count anywhere.
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.title)).not.toContain('Ash Blossom & Joyous Spring');
    expect(text).not.toContain('40');
    expect(listCollectorInventory).toHaveBeenCalledWith(
      { handle: 'duelist.jp', size: 5, excludeDeckCoreItems: true },
      'body',
      false,
      expect.anything(),
    );
    // Every picture is the API's card image.
    for (const img of element.querySelectorAll('img')) {
      expect(img.getAttribute('src') ?? '').toContain('/public/card-images/');
    }

    const asked: string[] = [];
    fixture.componentInstance.ask.subscribe((text) => asked.push(text));
    tiles[0].click();
    expect(asked).toEqual(['Could you add your Infinite Impermanence ($18) to the same package?']);
  });

  it('shows the seller their copies, visibility and binder, with Open in Inventory, and no More from', async () => {
    await render({
      conversation: chat('theo.duels', subject()),
      side: 'selling',
      selfId: 'seller',
    });
    const text = element.textContent ?? '';
    expect(text).toContain('Your copies');
    expect(text).toContain('×2');
    expect(text).toContain('Public');
    expect(text).toContain('Trade binder');
    expect(
      element.querySelector('[data-testid="open-in-inventory"]')?.getAttribute('href'),
    ).toContain('/inventory?item=item-1');
    expect(element.querySelector('[data-testid="more-from"]')).toBeNull();
    expect(listCollectorInventory).not.toHaveBeenCalled();
  });

  it('shows the sale with its tracking, Undo within 10 minutes and Rate', async () => {
    const note = {
      id: 'm1',
      kind: 'SYSTEM',
      senderId: null,
      createdAt: '2026-10-20T12:00:00Z',
      payload: {
        sale: {
          saleId: 'sale-1',
          sellerId: 'seller',
          buyerId: 'buyer',
          kind: 'CARD',
          name: 'Ash',
          quantity: 1,
          trackingNumber: '1Z999AA10123456784',
          undone: false,
        },
      },
    } as unknown as MessageResponse;
    await render({
      conversation: chat('theo.duels', subject({ sold: true })),
      side: 'selling',
      selfId: 'seller',
      messages: [note],
      canRate: true,
      now: Date.parse('2026-10-20T12:05:00Z'),
    });
    expect(element.querySelector('[data-testid="deal-sold"]')?.textContent).toContain(
      'Sold Oct 20',
    );
    expect(element.textContent).toContain('1Z999AA10123456784');
    const undone: string[] = [];
    fixture.componentInstance.undo.subscribe((id) => undone.push(id));
    element.querySelector<HTMLButtonElement>('[data-testid="deal-undo"]')!.click();
    expect(undone).toEqual(['sale-1']);
    expect(element.textContent).toContain('Rate theo.duels');

    fixture.componentRef.setInput('now', Date.parse('2026-10-20T12:11:00Z'));
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="deal-undo"]')).toBeNull();
  });

  it('shows no tiles when the seller’s cards are not public to the reader (404)', async () => {
    listCollectorInventory.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );
    await render({ conversation: chat('duelist.jp', subject()), side: 'buying', selfId: 'buyer' });
    expect(element.querySelector('[data-testid="more-from"]')).toBeNull();
    expect(element.textContent).not.toContain('Try again');
  });

  it('offers to share a card without a subject', async () => {
    await render({ conversation: chat('theo.duels', undefined), side: 'none', selfId: 'me' });
    expect(element.textContent).toContain('This chat is not about a card yet.');
    const shared: number[] = [];
    fixture.componentInstance.shareCard.subscribe(() => shared.push(1));
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Share a card from your inventory'))!
      .click();
    expect(shared).toEqual([1]);
    expect(element.querySelector('[data-testid="more-from"]')).toBeNull();
  });
});
