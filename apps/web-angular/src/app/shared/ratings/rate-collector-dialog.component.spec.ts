import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { RatingResponse, RatingsService } from '@orenji/api-client';
import { of, throwError } from 'rxjs';
import { RateCollectorDialogComponent, RateDialogData } from './rate-collector-dialog.component';

const RATING = {
  id: 'rt-1',
  rater: { handle: 'me', displayName: 'Me' },
  overall: 4,
  breakdown: { communication: 5, shipping: null },
  comment: 'Nice trade',
  createdAt: '2026-09-29T10:00:00Z',
  updatedAt: '2026-09-29T10:00:00Z',
  interactionKind: 'CONVERSATION_QUALIFIED',
  editableUntil: '2099-10-13T10:00:00Z',
} as unknown as RatingResponse;

describe('RateCollectorDialogComponent', () => {
  let fixture: ComponentFixture<RateCollectorDialogComponent>;
  let element: HTMLElement;
  let createRating: ReturnType<typeof vi.fn>;
  let updateRating: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  async function create(data: RateDialogData): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        { provide: RatingsService, useValue: { createRating, updateRating } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    fixture = TestBed.createComponent(RateCollectorDialogComponent);
    await fixture.whenStable();
    element = fixture.nativeElement as HTMLElement;
  }

  function star(group: string, score: number): HTMLButtonElement {
    const radiogroup = element.querySelector(`[role="radiogroup"][aria-label="${group}"]`);
    return radiogroup?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[score - 1] as never;
  }

  async function submit(): Promise<void> {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  beforeEach(() => {
    createRating = vi.fn(() => of(RATING));
    updateRating = vi.fn(() => of(RATING));
    close = vi.fn();
  });

  it('requires an overall score, then posts it with the chosen criteria and comment', async () => {
    await create({
      collector: { id: 'u-2', displayName: 'Tess', handle: 'tess' },
      interactions: [
        {
          id: 'i-1',
          kind: 'CONVERSATION_QUALIFIED',
          occurredAt: '2026-09-28T10:00:00Z',
          alreadyRated: false,
        } as never,
      ],
    });
    expect(element.querySelector('h2')?.textContent).toContain('Rate Tess');
    expect(element.textContent).toContain('Conversation');
    await submit();
    expect(element.textContent).toContain('Choose an overall score');
    expect(createRating).not.toHaveBeenCalled();

    star('Overall', 5).click();
    star('Communication', 4).click();
    const comment = element.querySelector('textarea') as HTMLTextAreaElement;
    comment.value = '  Friendly and on time.  ';
    comment.dispatchEvent(new Event('input'));
    await submit();
    expect(createRating).toHaveBeenCalledWith(
      {
        createRatingRequest: {
          interactionId: 'i-1',
          overall: 5,
          communication: 4,
          comment: 'Friendly and on time.',
        },
      },
      'body',
      false,
      expect.anything(),
    );
    expect(close).toHaveBeenCalledWith(RATING);
  });

  it('edits the own rating with PUT and keeps refusals inline', async () => {
    updateRating.mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'RATING_EDIT_WINDOW_CLOSED', status: 409 },
          }),
      ),
    );
    await create({ collector: { id: 'u-2', displayName: 'Tess' }, rating: RATING });
    expect(element.querySelector('h2')?.textContent).toContain('Edit your rating');
    expect(star('Overall', 4).getAttribute('aria-checked')).toBe('true');
    star('Overall', 3).click();
    await submit();
    expect(updateRating).toHaveBeenCalledWith(
      {
        id: 'rt-1',
        updateRatingRequest: { overall: 3, communication: 5, comment: 'Nice trade' },
      },
      'body',
      false,
      expect.anything(),
    );
    expect(element.querySelector('[data-testid="rating-error"]')?.textContent).toContain('14 days');
    expect(close).not.toHaveBeenCalled();
  });
});
