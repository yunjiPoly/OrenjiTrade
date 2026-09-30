import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FreshnessBadgeComponent } from './freshness-badge.component';
import { freshnessFromDate } from './freshness';

const NOW = new Date('2026-09-29T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe('freshnessFromDate', () => {
  it('buckets by age', () => {
    expect(freshnessFromDate(daysAgo(0), NOW)).toBe('fresh');
    expect(freshnessFromDate(daysAgo(14), NOW)).toBe('fresh');
    expect(freshnessFromDate(daysAgo(15), NOW)).toBe('aging');
    expect(freshnessFromDate(daysAgo(30), NOW)).toBe('aging');
    expect(freshnessFromDate(daysAgo(31), NOW)).toBe('stale');
    expect(freshnessFromDate(daysAgo(45), NOW)).toBe('stale');
    expect(freshnessFromDate(daysAgo(46), NOW)).toBe('hidden');
    expect(freshnessFromDate(null, NOW)).toBe('hidden');
  });
});

describe('FreshnessBadgeComponent', () => {
  let fixture: ComponentFixture<FreshnessBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FreshnessBadgeComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(FreshnessBadgeComponent);
    fixture.componentRef.setInput('now', NOW);
  });

  it('renders the explicit state and the relative update time', async () => {
    fixture.componentRef.setInput('state', 'aging');
    fixture.componentRef.setInput('updatedAt', new Date(NOW.getTime() - 3 * 3_600_000));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.badge')?.classList).toContain('badge--aging');
    expect(el.querySelector('.badge__state')?.textContent).toBe('Aging');
    expect(el.querySelector('.badge__time')?.textContent).toBe('Updated 3 hours ago');
  });

  it('derives the state from the date when none is given', async () => {
    fixture.componentRef.setInput('updatedAt', daysAgo(40));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.badge')?.classList).toContain('badge--stale');
    expect(el.querySelector('.badge__state')?.textContent).toBe('Stale');
  });

  it('shows the server label and, when compact, only the dot for fresh listings', async () => {
    fixture.componentRef.setInput('state', 'fresh');
    fixture.componentRef.setInput('label', 'Updated yesterday');
    fixture.componentRef.setInput('compact', true);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.badge__time')?.textContent).toBe('Updated yesterday');
    expect(el.querySelector('.badge__state')?.classList).toContain('visually-hidden');

    fixture.componentRef.setInput('state', 'stale');
    await fixture.whenStable();
    expect(el.querySelector('.badge__state')?.classList).not.toContain('visually-hidden');
    expect(el.textContent).toContain('Stale');
  });
});
