import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { WishUsage } from '../data/wishlist.store';
import { WishlistSummaryComponent } from './wishlist-summary.component';

describe('WishlistSummaryComponent', () => {
  let fixture: ComponentFixture<WishlistSummaryComponent>;
  let element: HTMLElement;

  async function render(usage: WishUsage): Promise<void> {
    fixture.componentRef.setInput('usage', usage);
    fixture.componentRef.setInput('count', usage.used);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WishlistSummaryComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(WishlistSummaryComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows the usage meter of a nearly full wishlist, with nothing to buy', async () => {
    await render({ used: 20, limit: 20 });
    expect(element.textContent).toContain('20 of 20 wishes');
    expect(element.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('20');
    expect(element.querySelector('.ws__fill--full')).not.toBeNull();
    expect(element.querySelector('a')).toBeNull();
    expect(element.textContent).not.toMatch(/premium|plan/i);
  });

  it('shows the room left, or an unlimited wishlist', async () => {
    await render({ used: 3, limit: 20 });
    expect(element.textContent).toContain('3 of 20 wishes');
    expect(element.querySelector('.ws__fill--full')).toBeNull();
    await render({ used: 3, limit: null });
    expect(element.textContent).toContain('3 wishes · unlimited');
  });
});
