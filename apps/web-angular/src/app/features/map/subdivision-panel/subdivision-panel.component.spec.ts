import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicBinderSummary } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { SubdivisionBinders } from '../data/region-map.store';
import { SubdivisionPanelComponent } from './subdivision-panel.component';

function binder(id: string): PublicBinderSummary {
  return {
    id,
    name: `Trade binder ${id}`,
    description: '',
    kind: 'TRADE',
    itemCount: 3,
    games: ['yugioh'],
    freshness: {
      state: 'ACTIVE',
      confirmedAt: '2026-10-07T10:00:00Z',
      updatedAt: '2026-10-07T10:00:00Z',
      label: 'Updated yesterday',
    },
    owner: {
      id: `owner-${id}`,
      handle: `owner${id}`,
      displayName: `Owner ${id}`,
      avatarUrl: null,
      place: {
        regionCode: 'americas-north',
        countryCode: 'CA',
        countryName: 'Canada',
        subdivisionCode: 'CA-QC',
        subdivisionName: 'Quebec',
        label: 'Quebec, Canada',
      },
    },
  } as PublicBinderSummary;
}

function state(overrides: Partial<SubdivisionBinders>): SubdivisionBinders {
  return {
    code: 'CA-QC',
    items: [],
    nextCursor: null,
    loading: false,
    loadingMore: false,
    error: null,
    ...overrides,
  };
}

describe('SubdivisionPanelComponent', () => {
  let fixture: ComponentFixture<SubdivisionPanelComponent>;
  let element: HTMLElement;
  const events: string[] = [];

  beforeEach(() => {
    events.length = 0;
    TestBed.configureTestingModule({
      imports: [SubdivisionPanelComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(SubdivisionPanelComponent);
    fixture.componentRef.setInput('title', 'Quebec, Canada');
    fixture.componentRef.setInput('subtitle', '2 public binders');
    fixture.componentInstance.closed.subscribe(() => events.push('closed'));
    fixture.componentInstance.loadMore.subscribe(() => events.push('more'));
    fixture.componentInstance.retry.subscribe(() => events.push('retry'));
    element = fixture.nativeElement as HTMLElement;
  });

  function show(binders: SubdivisionBinders): void {
    fixture.componentRef.setInput('binders', binders);
    fixture.detectChanges();
  }

  it('shows a skeleton while the first page loads and focuses the heading', () => {
    show(state({ loading: true }));
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(element.querySelector('h2')?.textContent).toContain('Quebec, Canada');
    expect(document.activeElement).toBe(element.querySelector('h2'));
  });

  it('lists the binders with their owner handle and state only, then pages with "Show more"', () => {
    show(state({ items: [binder('1'), binder('2')], nextCursor: 'c2' }));
    const items = element.querySelectorAll('.sdp__item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Trade binder 1');
    expect(items[0].textContent).toContain('@owner1');
    expect(element.textContent).not.toMatch(/km|Montréal/);
    const more = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Show more binders'),
    )!;
    more.click();
    expect(events).toEqual(['more']);
  });

  it('says so when the state has no public binder', () => {
    show(state({}));
    expect(element.textContent).toContain('No public binders here yet');
  });

  it('offers a retry when a page fails and goes back to the list', () => {
    const error = new ApiError({
      errorCode: 'INTERNAL_ERROR',
      message: 'Something failed',
      requestId: 'r-1',
      status: 500,
      fieldErrors: {},
    });
    show(state({ error }));
    expect(element.textContent).toContain('We could not load these binders');
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Retry'))!
      .click();
    element.querySelector<HTMLButtonElement>('button[aria-label="Back to the list"]')!.click();
    expect(events).toEqual(['retry', 'closed']);
  });
});
