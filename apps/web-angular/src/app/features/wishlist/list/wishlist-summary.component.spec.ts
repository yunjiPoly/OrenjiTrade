import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeatureFlagsService } from '../../../core/feature-flags/feature-flags.service';
import type { WishUsage } from '../data/wishlist.store';
import { WishlistSummaryComponent } from './wishlist-summary.component';

describe('WishlistSummaryComponent', () => {
  let fixture: ComponentFixture<WishlistSummaryComponent>;
  let element: HTMLElement;

  async function render(usage: WishUsage, premiumPlans: boolean): Promise<void> {
    TestBed.inject(FeatureFlagsService).set({ premiumPlans });
    fixture.componentRef.setInput('usage', usage);
    fixture.componentRef.setInput('count', usage.used);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WishlistSummaryComponent],
      providers: [provideRouter([{ path: 'premium', children: [] }])],
    }).compileComponents();
    fixture = TestBed.createComponent(WishlistSummaryComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows the usage meter and the Premium link once the wishlist is nearly full', async () => {
    await render({ used: 20, limit: 20, planName: 'Free' } as WishUsage, true);
    expect(element.textContent).toContain('20 of 20 wishes');
    expect(element.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('20');
    const link = element.querySelector<HTMLAnchorElement>('a.ws__upgrade');
    expect(link?.getAttribute('href')).toBe('/premium');
    expect(link?.textContent).toContain('Need more room? See Premium');
  });

  it('never links to Premium while the premiumPlans flag is off (launch configuration)', async () => {
    await render({ used: 20, limit: 20, planName: 'Free' } as WishUsage, false);
    expect(element.textContent).toContain('20 of 20 wishes');
    expect(element.querySelector('.ws__fill--full')).not.toBeNull();
    expect(element.querySelector('a.ws__upgrade')).toBeNull();
    expect(element.textContent).not.toContain('Premium');
  });

  it('shows no upgrade link while there is room left', async () => {
    await render({ used: 3, limit: 20, planName: 'Free' } as WishUsage, true);
    expect(element.querySelector('a.ws__upgrade')).toBeNull();
    expect(element.textContent).toContain('3 of 20 wishes');
  });
});
