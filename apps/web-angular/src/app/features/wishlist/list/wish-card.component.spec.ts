import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  WishlistItemResponse,
  WishlistItemResponseTradePreferenceEnum as Trade,
} from '@orenji/api-client';
import { WishCardComponent } from './wish-card.component';

function wish(overrides: Partial<WishlistItemResponse> = {}): WishlistItemResponse {
  return {
    id: 'w1',
    game: 'yugioh',
    card: { id: 'c1', name: 'Azure-Eyes Sky Dragon', imageUrl: '/card.svg' },
    printing: {
      id: 'p1',
      printingCode: 'AZR-EN001',
      setName: 'Azure Dawn',
      images: [{ kind: 'FRONT' as never, url: '/printing.svg' }],
    },
    conditionMin: 'LIGHTLY_PLAYED',
    maxPrice: 60,
    currency: 'CAD',
    tradePreference: Trade.Trade,
    notes: 'For my deck',
    active: true,
    matchCount: 3,
    lastMatchedAt: new Date().toISOString(),
    createdAt: '2026-09-30T10:00:00Z',
    updatedAt: '2026-09-30T10:00:00Z',
    ...overrides,
  };
}

describe('WishCardComponent', () => {
  let fixture: ComponentFixture<WishCardComponent>;
  let element: HTMLElement;

  async function render(item: WishlistItemResponse): Promise<void> {
    fixture.componentRef.setInput('item', item);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WishCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(WishCardComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows the card, the printing, the criteria and the matches', async () => {
    await render(wish());
    const link = element.querySelector<HTMLAnchorElement>('.wc__link');
    expect(link?.textContent?.trim()).toBe('Azure-Eyes Sky Dragon');
    expect(link?.getAttribute('href')).toBe('/cards/c1?printing=p1');
    expect(element.querySelector('.wc__printing')?.textContent).toContain('AZR-EN001');
    expect(element.querySelector('.wc__printing')?.textContent).toContain('Azure Dawn');
    const chips = Array.from(element.querySelectorAll('.wc__chip'), (chip) =>
      chip.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(chips).toEqual([
      'verified Lightly Played or better',
      'payments Up to $60.00',
      'swap_horiz Trade only',
    ]);
    expect(element.querySelector('.wc__notes')?.textContent).toContain('For my deck');
    const matches = element.querySelector<HTMLButtonElement>('[data-testid="wish-matches"]');
    expect(matches?.textContent).toContain('3 matches');
    expect(matches?.getAttribute('aria-label')).toBe('3 matches for Azure-Eyes Sky Dragon');
    expect(element.querySelector('.wc__last')?.textContent).toContain('Last match');
    expect(element.querySelector('article')?.classList).toContain('wc--matched');
  });

  it('says "Any printing" and dims paused wishes', async () => {
    await render(wish({ printing: undefined, active: false, matchCount: 0, lastMatchedAt: null }));
    expect(element.querySelector('.wc__printing')?.textContent?.trim()).toBe('Any printing');
    expect(element.querySelector('article')?.classList).toContain('wc--paused');
    expect(element.querySelector('[data-testid="wish-matches"]')?.textContent).toContain(
      'No matches yet',
    );
    expect(element.querySelector('.wc__last')).toBeNull();
  });

  it('emits the matches, alerts and menu actions', async () => {
    await render(wish());
    const opened = vi.fn();
    const toggled = vi.fn();
    fixture.componentInstance.openMatches.subscribe(opened);
    fixture.componentInstance.activeChange.subscribe(toggled);
    element.querySelector<HTMLButtonElement>('[data-testid="wish-matches"]')!.click();
    expect(opened).toHaveBeenCalled();
    element.querySelector<HTMLButtonElement>('button[role="switch"]')!.click();
    expect(toggled).toHaveBeenCalledWith(false);
  });
});
