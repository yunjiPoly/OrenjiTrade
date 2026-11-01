import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ModerationHistory } from '@orenji/api-client';
import { ReportHistoryComponent } from './report-history.component';

/** Board A8 (web stage WH2 review fix 1): the account page shows its lists open. */
describe('ReportHistoryComponent', () => {
  const history = {
    recentReports: [],
    recentRatings: [],
    openFlags: [],
    recentPostsRemoved: [],
    suspensions: [],
    listingsPaused: [],
  } as unknown as ModerationHistory;

  function render(accountView: boolean) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ReportHistoryComponent);
    fixture.componentRef.setInput('history', history);
    fixture.componentRef.setInput('accountView', accountView);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const toggles = Array.from(element.querySelectorAll<HTMLButtonElement>('.hs__toggle'));
    return { fixture, toggles };
  }

  it('opens Recent reports only on a report', () => {
    const { toggles } = render(false);
    expect(toggles[0].textContent).toContain('Recent reports');
    expect(toggles.map((t) => t.getAttribute('aria-expanded'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
  });

  it('opens every list as “Reports about them” on the account page, each one still closable', () => {
    const { fixture, toggles } = render(true);
    expect(toggles[0].textContent).toContain('Reports about them');
    expect(toggles.every((t) => t.getAttribute('aria-expanded') === 'true')).toBe(true);
    toggles[1].click();
    fixture.detectChanges();
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
  });
});
