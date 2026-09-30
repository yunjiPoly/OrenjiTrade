import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import {
  RatingEligibilityInteraction,
  RatingResponse,
  RatingsService,
  UpdateRatingRequest,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';
import { AvatarComponent } from '../ui/avatar/avatar.component';
import {
  INTERACTION_KIND_ICONS,
  RATING_COMMENT_MAX,
  RATING_CRITERIA,
  RATING_EDIT_DAYS,
  RatingCriterion,
  interactionKindLabel,
  ratingProblem,
} from './rating-labels';
import { StarRatingInputComponent } from './star-rating-input.component';

/** The collector being rated. */
export interface RatedCollector {
  id: string;
  displayName: string;
  handle?: string | null;
  avatarUrl?: string | null;
}

export interface RateDialogData {
  collector: RatedCollector;
  /** Interactions still rateable (create mode), most recent first. */
  interactions?: readonly RatingEligibilityInteraction[];
  /** The caller's own rating (edit mode, `PUT /ratings/{id}` while `editableUntil`). */
  rating?: RatingResponse;
}

type ScoreControl = FormControl<number | null>;

/**
 * "Rate this collector": pick the interaction (trade, accepted offer or qualified conversation),
 * an overall score, the optional criteria (communication, card condition, shipping, meetup
 * reliability) and a comment ≤ 600. Creates with `POST /ratings` or, for the author's own rating,
 * edits with `PUT /ratings/{id}` during the 14-day window. Refusals (403 not eligible, 409 already
 * rated / window closed, banned terms) stay inline. Closes with the saved rating.
 */
@Component({
  selector: 'app-rate-collector-dialog',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    AvatarComponent,
    StarRatingInputComponent,
  ],
  template: `
    @let who = data.collector;
    <h2 mat-dialog-title>{{ editing ? 'Edit your rating' : 'Rate ' + who.displayName }}</h2>
    <form [formGroup]="form" (submit)="submit($event)" novalidate>
      <mat-dialog-content>
        <div class="who">
          <app-avatar [src]="who.avatarUrl" [name]="who.displayName" [decorative]="true" />
          <span class="who__names">
            <span class="who__name">{{ who.displayName }}</span>
            @if (who.handle) {
              <span class="who__handle">&#64;{{ who.handle }}</span>
            }
          </span>
        </div>

        @if (data.rating; as rating) {
          <p class="interaction">
            <mat-icon aria-hidden="true">{{ icons[rating.interactionKind] ?? 'star' }}</mat-icon>
            {{ kindLabel(rating.interactionKind) }} · editable until
            {{ rating.editableUntil | date: 'mediumDate' }}
          </p>
        } @else if (interactions.length > 1) {
          <p class="label" [id]="ids.interaction">Which interaction are you rating?</p>
          <mat-radio-group
            class="interactions"
            formControlName="interactionId"
            [attr.aria-labelledby]="ids.interaction"
          >
            @for (interaction of interactions; track interaction.id) {
              <mat-radio-button [value]="interaction.id">
                {{ kindLabel(interaction.kind) }} ·
                {{ interaction.occurredAt | date: 'mediumDate' }}
              </mat-radio-button>
            }
          </mat-radio-group>
        } @else if (interactions[0]; as interaction) {
          <p class="interaction">
            <mat-icon aria-hidden="true">{{ icons[interaction.kind] ?? 'star' }}</mat-icon>
            {{ kindLabel(interaction.kind) }} ·
            {{ interaction.occurredAt | date: 'mediumDate' }}
          </p>
        }

        <div class="row row--overall">
          <span class="row__label">
            Overall
            <small>Required</small>
          </span>
          <app-star-rating-input formControlName="overall" label="Overall" required />
        </div>
        @if (showOverallError()) {
          <p class="error" role="alert">Choose an overall score from 1 to 5 stars.</p>
        }

        <fieldset class="criteria">
          <legend>Details <span>(optional)</span></legend>
          @for (criterion of criteria; track criterion.key) {
            <div class="row">
              <span class="row__label">
                {{ criterion.label }}
                <small>{{ criterion.hint }}</small>
              </span>
              <app-star-rating-input
                [formControlName]="criterion.key"
                [label]="criterion.label"
                clearable
              />
            </div>
          }
        </fieldset>

        <mat-form-field appearance="outline" class="comment">
          <mat-label>Comment (optional)</mat-label>
          <textarea
            matInput
            formControlName="comment"
            rows="3"
            [attr.maxlength]="maxComment"
            placeholder="How did it go? Keep it factual and friendly."
          ></textarea>
          <mat-hint align="end">{{ commentLength() }} / {{ maxComment }}</mat-hint>
          @if (form.controls.comment.hasError('maxlength')) {
            <mat-error>Keep the comment under {{ maxComment }} characters.</mat-error>
          }
        </mat-form-field>

        <p class="note">
          <mat-icon aria-hidden="true">public</mat-icon>
          Ratings appear on {{ who.displayName }}'s profile with your name. You can change yours
          during {{ editDays }} days.
        </p>

        @if (problem(); as problem) {
          <p class="problem" role="alert" data-testid="rating-error">
            <mat-icon aria-hidden="true">error</mat-icon>
            <span>{{ problem }}</span>
          </p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button matButton type="button" mat-dialog-close>Cancel</button>
        <button matButton="filled" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : editing ? 'Save changes' : 'Submit rating' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .who {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-3);
    }
    .who__names {
      display: flex;
      flex-direction: column;
    }
    .who__name {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .who__handle {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .label {
      margin: 0 0 var(--spacing-1);
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .interactions {
      display: flex;
      flex-direction: column;
      margin-bottom: var(--spacing-3);
    }
    .interaction {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-3);
      padding: var(--spacing-1) var(--spacing-3);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
    .interaction mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-1) var(--spacing-3);
      padding: var(--spacing-1) 0;
    }
    .row--overall {
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
    }
    .row__label {
      display: flex;
      flex-direction: column;
      color: var(--color-ink);
      font-weight: var(--font-weight-medium);
    }
    .row__label small {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-regular);
    }
    .criteria {
      margin: var(--spacing-3) 0;
      padding: 0;
      border: 0;
    }
    .criteria legend {
      margin-bottom: var(--spacing-1);
      padding: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .criteria legend span {
      color: var(--color-text-muted);
      font-weight: var(--font-weight-regular);
    }
    .comment {
      display: block;
      width: 100%;
    }
    .note {
      display: flex;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .note mat-icon {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .error {
      margin: var(--spacing-1) 0 0;
      color: var(--color-danger);
      font-size: var(--font-size-sm);
    }
    .problem {
      display: flex;
      gap: var(--spacing-2);
      margin: var(--spacing-3) 0 0;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
      color: var(--color-ink);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RateCollectorDialogComponent {
  private readonly api = inject(RatingsService);
  private readonly ref =
    inject<MatDialogRef<RateCollectorDialogComponent, RatingResponse>>(MatDialogRef);
  protected readonly data = inject<RateDialogData>(MAT_DIALOG_DATA);

  protected readonly editing = !!this.data.rating;
  protected readonly interactions = this.data.interactions ?? [];
  protected readonly criteria = RATING_CRITERIA;
  protected readonly icons = INTERACTION_KIND_ICONS;
  protected readonly maxComment = RATING_COMMENT_MAX;
  protected readonly editDays = RATING_EDIT_DAYS;
  protected readonly kindLabel = interactionKindLabel;
  protected readonly ids = { interaction: `rate-i-${Math.random().toString(36).slice(2, 8)}` };

  protected readonly form = new FormGroup({
    interactionId: new FormControl(this.data.rating ? '' : (this.interactions[0]?.id ?? ''), {
      nonNullable: true,
    }),
    overall: new FormControl<number | null>(this.data.rating?.overall ?? null, Validators.required),
    communication: this.score('communication'),
    conditionAccuracy: this.score('conditionAccuracy'),
    shipping: this.score('shipping'),
    meetupReliability: this.score('meetupReliability'),
    comment: new FormControl(this.data.rating?.comment ?? '', {
      nonNullable: true,
      validators: [Validators.maxLength(RATING_COMMENT_MAX)],
    }),
  });

  private readonly commentValue = toSignal(this.form.controls.comment.valueChanges, {
    initialValue: this.form.controls.comment.value,
  });
  protected readonly commentLength = computed(() => this.commentValue().length);
  private readonly submitted = signal(false);
  private readonly overallValue = toSignal(this.form.controls.overall.valueChanges, {
    initialValue: this.form.controls.overall.value,
  });
  protected readonly showOverallError = computed(
    () => this.submitted() && this.overallValue() === null,
  );
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  private score(key: RatingCriterion): ScoreControl {
    return new FormControl<number | null>(this.data.rating?.breakdown?.[key] ?? null);
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    const value = this.form.getRawValue();
    if (this.form.invalid || value.overall === null) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.editing && !value.interactionId) {
      this.problem.set('Choose the interaction you are rating.');
      return;
    }
    const body: UpdateRatingRequest = { overall: value.overall };
    for (const criterion of RATING_CRITERIA) {
      const score = value[criterion.key];
      if (score !== null) {
        body[criterion.key] = score;
      }
    }
    const comment = value.comment.trim();
    if (comment) {
      body.comment = comment;
    }
    this.saving.set(true);
    this.problem.set(null);
    try {
      const rating = await firstValueFrom(
        this.data.rating
          ? this.api.updateRating(
              { id: this.data.rating.id, updateRatingRequest: body },
              'body',
              false,
              { context: silentErrors() },
            )
          : this.api.createRating(
              { createRatingRequest: { ...body, interactionId: value.interactionId } },
              'body',
              false,
              { context: silentErrors() },
            ),
      );
      this.ref.close(rating);
    } catch (error) {
      this.problem.set(ratingProblem(toApiError(error), this.data.collector.displayName));
    } finally {
      this.saving.set(false);
    }
  }
}
