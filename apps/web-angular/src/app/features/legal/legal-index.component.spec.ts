import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeatureFlagsService } from '../../core/feature-flags/feature-flags.service';
import { LegalIndexComponent } from './legal-index.component';

describe('LegalIndexComponent (decision 23)', () => {
  let fixture: ComponentFixture<LegalIndexComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LegalIndexComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(LegalIndexComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const links = () =>
    Array.from(element.querySelectorAll<HTMLAnchorElement>('.legal-index a'), (a) =>
      a.getAttribute('href'),
    );

  it('hides Payment Protection and Refund & Dispute while protectedPayments is off', () => {
    expect(links()).not.toContain('/legal/payment-protection');
    expect(links()).not.toContain('/legal/refund-dispute');
    expect(links()).toContain('/legal/terms');
    expect(links()).toContain('/legal/trading-safely');
  });

  it('lists them while protectedPayments is on', async () => {
    TestBed.inject(FeatureFlagsService).set({ protectedPayments: true });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(links()).toContain('/legal/payment-protection');
    expect(links()).toContain('/legal/refund-dispute');
  });

  it('carries the card data credits the footer links to', () => {
    const credits = element.querySelector('#card-data-credits');
    expect(credits?.querySelector('h2')?.textContent).toBe('Card data credits');
    expect(credits?.querySelector('[data-testid="card-data-attribution"]')).not.toBeNull();
    expect(credits?.textContent).toContain('Natural Earth');
  });
});
