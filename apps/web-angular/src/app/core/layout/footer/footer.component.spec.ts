import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;
  let element: HTMLElement;

  function links(): string[] {
    return Array.from(element.querySelectorAll('nav[aria-label="Legal"] a'), (a) =>
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

  it('carries the wordmark, the line and the four links of spec 4.10', () => {
    expect(element.textContent).toContain('Who in my region has this card?');
    expect(links()).toEqual([
      'Trading safely',
      'Legal',
      'Card data credits',
      'Made with Natural Earth',
    ]);
    expect(element.querySelector('a[href="/legal/trading-safely"]')).not.toBeNull();
    expect(element.querySelector('a[href="/legal#card-data-credits"]')).not.toBeNull();
  });

  it('links no Premium, donation, offer or payment page (ADR 0018 and 0019)', () => {
    expect(element.querySelector('a[href="/premium"]')).toBeNull();
    expect(element.querySelector('a[href="/support"]')).toBeNull();
    expect(element.textContent).not.toMatch(/Premium|Support OrenjiTrade|Offers|Payment|Refund/);
  });
});
