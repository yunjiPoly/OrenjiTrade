import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CollectorProfileResponse,
  CollectorRatingsPage,
  RatingEligibility,
  RatingsService,
} from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { SessionService } from '../../../core/auth/session.service';
import { RatingActionsService } from '../../../shared/ratings/rating-actions.service';
import { CollectorRatingsSectionComponent } from './collector-ratings-section.component';

const PROFILE = {
  id: 'u-2',
  handle: 'tess',
  displayName: 'Tess Trader',
  bio: '',
  games: [],
  tags: [],
  memberSince: '2026-01-01T00:00:00Z',
  lastActiveBucket: 'TODAY',
  onlineStatus: 'OFFLINE',
  rating: { average: null, count: 0 },
  publicBinderCount: 0,
  canMessage: true,
  isBlocked: false,
} as unknown as CollectorProfileResponse;

function page(items: CollectorRatingsPage['items'], hasMore = false): CollectorRatingsPage {
  return {
    items,
    hasMore,
    nextCursor: hasMore ? 'next' : null,
    summary: {
      average: items.length ? 4.5 : null,
      count: items.length,
      communication: items.length ? 5 : null,
    },
  };
}

const MINE = {
  id: 'rt-1',
  rater: { handle: 'me', displayName: 'Me Myself' },
  overall: 5,
  breakdown: { communication: 5 },
  comment: 'Great trade',
  createdAt: '2026-09-29T10:00:00Z',
  updatedAt: '2026-09-29T10:00:00Z',
  interactionKind: 'TRADE',
  editableUntil: '2099-01-01T00:00:00Z',
} as unknown as CollectorRatingsPage['items'][number];

describe('CollectorRatingsSectionComponent', () => {
  let fixture: ComponentFixture<CollectorRatingsSectionComponent>;
  let element: HTMLElement;
  let listCollectorRatings: ReturnType<typeof vi.fn>;
  let listCollectorReferences: ReturnType<typeof vi.fn>;
  let eligibility: ReturnType<typeof vi.fn>;
  let rate: ReturnType<typeof vi.fn>;
  let edit: ReturnType<typeof vi.fn>;
  let summaries: unknown[];

  async function create(isOwn = false): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: RatingsService, useValue: { listCollectorRatings, listCollectorReferences } },
        {
          provide: RatingActionsService,
          useValue: { eligibility, rate, edit, writeReference: vi.fn() },
        },
        { provide: SessionService, useValue: { handle: signal('me') } },
      ],
    });
    fixture = TestBed.createComponent(CollectorRatingsSectionComponent);
    fixture.componentRef.setInput('profile', PROFILE);
    fixture.componentRef.setInput('isOwn', isOwn);
    summaries = [];
    fixture.componentInstance.summaryChange.subscribe((summary) => summaries.push(summary));
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function button(label: string): HTMLButtonElement | undefined {
    return [...element.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent?.includes(label) || node.getAttribute('aria-label') === label,
    );
  }

  beforeEach(() => {
    listCollectorRatings = vi.fn(() => of(page([])));
    listCollectorReferences = vi.fn(() => of({ items: [], hasMore: false }));
    eligibility = vi.fn(async (): Promise<RatingEligibility> => ({
      eligible: true,
      interactions: [
        {
          id: 'i-1',
          kind: 'CONVERSATION_QUALIFIED',
          occurredAt: '2026-09-28T10:00:00Z',
          alreadyRated: false,
        } as never,
      ],
    }));
    rate = vi.fn(async () => MINE);
    edit = vi.fn(async () => MINE);
  });

  it('offers "Rate this collector" and a reference to an eligible collector', async () => {
    await create();
    expect(element.textContent).toContain('No ratings yet');
    expect(button('Rate this collector')).toBeDefined();
    expect(button('Write a reference')).toBeDefined();
    listCollectorRatings.mockReturnValueOnce(of(page([MINE])));
    eligibility.mockResolvedValueOnce({
      eligible: false,
      interactions: [
        { id: 'i-1', kind: 'CONVERSATION_QUALIFIED', occurredAt: '2026-09-28', alreadyRated: true },
      ],
    });
    button('Rate this collector')?.click();
    await fixture.whenStable();
    expect(rate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u-2', displayName: 'Tess Trader' }),
      [expect.objectContaining({ id: 'i-1' })],
    );
    expect(element.querySelector('[data-testid="rating-average"]')?.textContent).toBe('4.5');
    expect(button('Rate this collector')).toBeUndefined();
    expect(element.querySelector('[data-testid="rating-hint"]')?.textContent).toContain(
      'You already rated your interactions',
    );
    expect(summaries.at(-1)).toMatchObject({ average: 4.5, count: 1 });
  });

  it('shows no rate action without an interaction, only why', async () => {
    eligibility.mockResolvedValueOnce({ eligible: false, interactions: [] });
    await create();
    expect(button('Rate this collector')).toBeUndefined();
    expect(button('Write a reference')).toBeUndefined();
    expect(element.querySelector('[data-testid="rating-hint"]')?.textContent).toContain(
      'You can rate Tess Trader after a completed trade',
    );
  });

  it('lets the author edit their own rating during the window', async () => {
    listCollectorRatings.mockReturnValue(of(page([MINE])));
    await create();
    expect(element.textContent).toContain('You');
    button('Edit your rating')?.click();
    await fixture.whenStable();
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-2' }), MINE);
  });

  it('never asks for eligibility on the own profile and retries a failed load', async () => {
    listCollectorRatings.mockReturnValueOnce(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );
    await create(true);
    expect(eligibility).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Ratings could not load');
    button('Retry')?.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('No ratings yet');
    expect(button('Rate this collector')).toBeUndefined();
  });
});
