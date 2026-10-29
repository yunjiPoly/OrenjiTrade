import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConversationSubject } from '@orenji/api-client';
import { PinnedBarComponent } from './pinned-bar.component';

const CARD = {
  kind: 'CARD',
  id: 'item-1',
  ownerId: 'seller',
  name: 'Ash Blossom & Joyous Spring',
  printingCode: 'RA01-EN008',
  rarity: 'Secret Rare',
  cardId: 'card-1',
  printingId: 'print-1',
  imageUrl: '/api/v1/public/card-images/img-1',
  askingPriceText: '$32',
  sold: false,
  listed: true,
  copies: 2,
} as ConversationSubject;

describe('PinnedBarComponent (web WC, spec 10.3)', () => {
  let fixture: ComponentFixture<PinnedBarComponent>;
  let element: HTMLElement;

  async function render(subject: ConversationSubject, side: 'buying' | 'selling'): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(PinnedBarComponent);
    fixture.componentRef.setInput('subject', subject);
    fixture.componentRef.setInput('side', side);
    fixture.componentRef.setInput('otherHandle', 'duelist.jp');
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  it('gives the seller the only Mark as sold, beside "your card" and the price', async () => {
    await render(CARD, 'selling');
    expect(element.textContent).toContain('RA01-EN008 · Secret Rare · your card');
    expect(element.querySelector('[data-testid="pinned-price"]')?.textContent).toContain('$32');
    const sell = element.querySelector<HTMLButtonElement>('[data-testid="mark-as-sold"]')!;
    expect(sell.getAttribute('aria-label')).toBe('Mark as sold: Ash Blossom & Joyous Spring');
    let asked = 0;
    fixture.componentInstance.markSold.subscribe(() => asked++);
    sell.click();
    expect(asked).toBe(1);
    // The art and the name open the card with its printing.
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/cards/card-1?printing=print-1');
  });

  it('shows the buyer the price, "Sold" after the sale and "No longer listed" without a price', async () => {
    await render(CARD, 'buying');
    expect(element.querySelector('[data-testid="mark-as-sold"]')).toBeNull();
    expect(element.textContent).toContain('$32');
    fixture.componentRef.setInput('subject', { ...CARD, sold: true });
    await fixture.whenStable();
    expect(element.querySelector('[data-testid="sold-tag"]')?.textContent).toContain('Sold');
    fixture.componentRef.setInput('subject', { ...CARD, listed: false, askingPriceText: null });
    await fixture.whenStable();
    expect(element.textContent).toContain('No longer listed');
    expect(element.querySelector('[data-testid="pinned-price"]')).toBeNull();
  });

  it('names a deck core with its tag and opens the binder', async () => {
    await render(
      {
        ...CARD,
        kind: 'DECK_CORE' as ConversationSubject['kind'],
        id: 'core-1',
        printingCode: null,
      },
      'buying',
    );
    expect(element.textContent).toContain('Deck core');
    expect(element.textContent).toContain('duelist.jp’s deck core');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/binders/core-1');
  });
});
