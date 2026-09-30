import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { CollectorProfileResponse, RatingSummaryResponse } from '@orenji/api-client';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { CollectorRatingsStore } from './collector-ratings.store';
import { RatingItemComponent } from './rating-item.component';
import { RatingSummaryComponent } from './rating-summary.component';

/**
 * "Ratings & references" of a collector profile: the summary with its breakdown, the paginated
 * ratings, the references, and — only when `GET /ratings/eligibility` says so — "Rate this
 * collector" (an unrated interaction exists) and "Write a reference". The author of a rating can
 * edit it from the list during 14 days. Emits the fresh summary so the profile header can follow.
 */
@Component({
  selector: 'app-collector-ratings-section',
  providers: [CollectorRatingsStore],
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    RatingItemComponent,
    RatingSummaryComponent,
    RelativeTimePipe,
    SkeletonComponent,
  ],
  template: `
    @let p = profile();
    <section class="ratings" id="collector-ratings" aria-labelledby="collector-ratings-heading">
      <header class="ratings__head">
        <div>
          <h2 id="collector-ratings-heading" tabindex="-1">Ratings &amp; references</h2>
          <p class="ratings__muted">
            From collectors who traded, made a deal or had a real conversation with
            {{ isOwn() ? 'you' : p.displayName }}.
          </p>
        </div>
        @if (store.canRate()) {
          <button matButton="filled" type="button" (click)="store.rate()">
            <mat-icon aria-hidden="true">star</mat-icon>
            Rate this collector
          </button>
        }
      </header>

      @switch (store.status()) {
        @case ('error') {
          <app-error-state
            compact
            title="Ratings could not load"
            [message]="errorMessage()"
            [requestId]="store.error()?.requestId ?? null"
            (retry)="store.load()"
          />
        }
        @case ('ready') {
          <div class="ratings__layout">
            <app-rating-summary class="ratings__summary" [summary]="store.summary()" />
            <div class="ratings__list">
              @if (store.ratings().length === 0) {
                <app-empty-state
                  icon="star_outline"
                  title="No ratings yet"
                  [description]="
                    isOwn()
                      ? 'Collectors can rate you after a completed trade, an accepted offer or a real conversation.'
                      : 'Ratings appear after completed trades, accepted offers or real conversations.'
                  "
                />
              } @else {
                <ul class="ratings__items" aria-label="Ratings">
                  @for (rating of store.ratings(); track rating.id) {
                    <li>
                      <app-rating-item
                        [rating]="rating"
                        [mine]="store.isMine(rating)"
                        [editable]="store.canEdit(rating)"
                        (edit)="store.edit(rating)"
                      />
                    </li>
                  }
                </ul>
                @if (store.hasMore()) {
                  <button
                    matButton
                    type="button"
                    class="ratings__more"
                    [disabled]="store.loadingMore()"
                    (click)="store.loadMore()"
                  >
                    {{ store.loadingMore() ? 'Loading…' : 'Show more ratings' }}
                  </button>
                }
              }
              @if (hint(); as hint) {
                <p class="ratings__hint" data-testid="rating-hint">
                  <mat-icon aria-hidden="true">info</mat-icon>
                  {{ hint }}
                </p>
              }
            </div>
          </div>
        }
        @default {
          <div class="ratings__layout" aria-busy="true">
            <span class="visually-hidden">Loading ratings</span>
            <app-skeleton height="160px" />
            <app-skeleton variant="list" lines="3" />
          </div>
        }
      }

      <div class="refs">
        <div class="refs__head">
          <h3 id="collector-references-heading">References</h3>
          @if (store.canReference()) {
            <button matButton="outlined" type="button" (click)="store.writeReference()">
              <mat-icon aria-hidden="true">rate_review</mat-icon>
              Write a reference
            </button>
          }
        </div>
        @if (store.references(); as references) {
          @if (references.length === 0) {
            <p class="ratings__muted">
              @if (store.referencesFailed()) {
                References could not load.
                <button matButton type="button" (click)="store.loadReferences()">Retry</button>
              } @else {
                No references yet.
              }
            </p>
          } @else {
            <ul class="refs__list" aria-labelledby="collector-references-heading">
              @for (reference of references; track reference.id) {
                <li class="ref">
                  <app-avatar
                    size="sm"
                    [src]="reference.author.avatarUrl"
                    [name]="reference.author.displayName"
                    [decorative]="true"
                  />
                  <div class="ref__body">
                    <p class="ref__who">
                      <a [routerLink]="['/collectors', reference.author.handle]">{{
                        reference.author.displayName
                      }}</a>
                      <span class="ratings__muted">· {{ reference.createdAt | relativeTime }}</span>
                    </p>
                    <p class="ref__text">“{{ reference.body }}”</p>
                  </div>
                </li>
              }
            </ul>
            @if (store.hasMoreReferences()) {
              <button matButton type="button" (click)="store.loadReferences(true)">
                Show more references
              </button>
            }
          }
        } @else {
          <app-skeleton variant="list" lines="1" />
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .ratings {
      padding: var(--spacing-5);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      scroll-margin-top: 88px;
    }
    .ratings__head {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
    }
    .ratings__head h2 {
      font-size: var(--font-size-lg);
    }
    .ratings__muted {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ratings__layout {
      display: grid;
      grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
      gap: var(--spacing-6);
      align-items: start;
    }
    .ratings__summary {
      padding: var(--spacing-4);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .ratings__items {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ratings__items li + li {
      border-top: 1px solid var(--color-border);
    }
    .ratings__more {
      margin-top: var(--spacing-2);
    }
    .ratings__hint {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-2);
      margin: var(--spacing-3) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .ratings__hint mat-icon {
      flex: 0 0 auto;
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .refs {
      margin-top: var(--spacing-6);
      padding-top: var(--spacing-4);
      border-top: 1px solid var(--color-border);
    }
    .refs__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-bottom: var(--spacing-2);
    }
    .refs__head h3 {
      font-size: var(--font-size-md);
    }
    .refs__list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .ref {
      display: flex;
      gap: var(--spacing-3);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
    }
    .ref__who {
      margin: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .ref__text {
      margin: var(--spacing-1) 0 0;
      color: var(--color-ink);
      font-style: italic;
      overflow-wrap: anywhere;
    }
    @media (max-width: 719px) {
      .ratings__layout {
        grid-template-columns: 1fr;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorRatingsSectionComponent {
  protected readonly store = inject(CollectorRatingsStore);

  readonly profile = input.required<CollectorProfileResponse>();
  readonly isOwn = input(false);
  /** The summary after every (re)load, for the profile header. */
  readonly summaryChange = output<RatingSummaryResponse>();

  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  /** Why no "Rate" button is offered to a signed-in visitor (null when nothing to say). */
  protected readonly hint = computed(() => {
    if (this.isOwn() || this.store.canRate()) {
      return null;
    }
    const eligibility = this.store.eligibility();
    if (!eligibility) {
      return null;
    }
    const name = this.profile().displayName;
    return eligibility.interactions.length > 0
      ? `You already rated your interactions with ${name}. You can edit a rating for 14 days.`
      : `You can rate ${name} after a completed trade, an accepted offer or a conversation ` +
          'where you both sent at least 3 messages.';
  });

  constructor() {
    effect(() => {
      const profile = this.profile();
      const own = this.isOwn();
      untracked(() =>
        this.store.open(
          {
            id: profile.id,
            handle: profile.handle,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          },
          own,
        ),
      );
    });
    effect(() => {
      const summary = this.store.summary();
      if (summary && this.store.status() === 'ready') {
        untracked(() => this.summaryChange.emit(summary));
      }
    });
  }
}
