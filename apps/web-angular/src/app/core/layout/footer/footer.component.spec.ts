import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;
  let element: HTMLElement;

  function links(label: string): string[] {
    return Array.from(element.querySelectorAll(`nav[aria-label="${label}"] a`), (a) =>
      (a.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(FooterComponent);
    element = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('shows no Premium or donation link until the flags allow them (launch configuration)', async () => {
    TestBed.inject(FeatureFlagsService).set({ premiumPlans: false, donations: false });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(element.querySelector('nav[aria-label="OrenjiTrade"]')).toBeNull();
    expect(element.querySelector('a[href="/premium"]')).toBeNull();
    expect(element.querySelector('a[href="/support"]')).toBeNull();
    expect(links('Legal')).toContain('Trading safely');
  });

  it('links to Premium and to Support OrenjiTrade once their flags are on', async () => {
    TestBed.inject(FeatureFlagsService).set({ premiumPlans: true, donations: true });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(links('OrenjiTrade')).toEqual([
      expect.stringContaining('Support OrenjiTrade'),
      'Premium',
    ]);
    expect(element.querySelector('a[href="/premium"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="footer-support"]')?.getAttribute('href')).toBe(
      '/support',
    );
  });
});
