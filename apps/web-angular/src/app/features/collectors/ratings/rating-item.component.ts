import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { RatingResponse } from '@orenji/api-client';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import {
  INTERACTION_KIND_ICONS,
  breakdownEntries,
  interactionKindLabel,
} from '../../../shared/ratings/rating-labels';
import { StarRatingComponent } from '../../../shared/ratings/star-rating.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';

/** One rating of the profile list: rater, stars, interaction, date, comment and criteria. */
@Component({
  selector: 'app-rating-item',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    RelativeTimePipe,
    StarRatingComponent,
  ],
  template: `
    @let r = rating();
    <article class="rating" [attr.aria-label]="'Rating by ' + r.rater.displayName">
      <app-avatar
        size="sm"
        [src]="r.rater.avatarUrl"
        [name]="r.rater.displayName"
        [decorative]="true"
      />
      <div class="rating__body">
        <header class="rating__head">
          <a class="rating__who" [routerLink]="['/collectors', r.rater.handle]">
            {{ r.rater.displayName }}
          </a>
          @if (mine()) {
            <span class="rating__you">You</span>
          }
          <app-star-rating [value]="r.overall" size="sm" />
          <span class="rating__kind">
            <mat-icon aria-hidden="true">{{ icons[r.interactionKind] ?? 'star' }}</mat-icon>
            {{ kind() }}
          </span>
          <time class="rating__when" [attr.datetime]="r.createdAt" [title]="r.createdAt | date">
            {{ r.createdAt | relativeTime }}
          </time>
          @if (r.updatedAt !== r.createdAt) {
            <span class="rating__when">· edited</span>
          }
        </header>
        @if (r.comment) {
          <p class="rating__comment">{{ r.comment }}</p>
        }
        @if (criteria().length) {
          <ul class="rating__criteria" aria-label="Details">
            @for (entry of criteria(); track entry.label) {
              <li>
                {{ entry.label }} <strong>{{ entry.value }}</strong
                ><span aria-hidden="true">★</span><span class="visually-hidden"> of 5</span>
              </li>
            }
          </ul>
        }
      </div>
      @if (editable()) {
        <button
          matButton
          type="button"
          class="rating__edit"
          aria-label="Edit your rating"
          (click)="edit.emit()"
        >
          <mat-icon aria-hidden="true">edit</mat-icon>
          Edit
        </button>
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .rating {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      padding: var(--spacing-3) 0;
    }
    .rating__body {
      flex: 1 1 auto;
      min-width: 0;
    }
    .rating__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1) var(--spacing-2);
    }
    .rating__who {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .rating__who:hover {
      text-decoration: underline;
    }
    .rating__you {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .rating__kind {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .rating__kind mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .rating__when {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .rating__comment {
      margin: var(--spacing-1) 0 0;
      color: var(--color-ink);
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .rating__criteria {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1);
      margin: var(--spacing-2) 0 0;
      padding: 0;
      list-style: none;
    }
    .rating__criteria li {
      padding: 1px var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .rating__criteria strong {
      margin-left: 2px;
      color: var(--color-ink);
    }
    .rating__criteria span[aria-hidden] {
      color: var(--color-warning);
    }
    .rating__edit {
      flex: 0 0 auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingItemComponent {
  readonly rating = input.required<RatingResponse>();
  /** Written by the viewer. */
  readonly mine = input(false);
  /** The viewer may still edit it. */
  readonly editable = input(false);
  readonly edit = output<void>();

  protected readonly icons = INTERACTION_KIND_ICONS;
  protected readonly kind = computed(() => interactionKindLabel(this.rating().interactionKind));
  protected readonly criteria = computed(() => breakdownEntries(this.rating().breakdown));
}
