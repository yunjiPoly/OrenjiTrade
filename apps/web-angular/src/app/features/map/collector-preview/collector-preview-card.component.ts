import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import type { CollectorPreview, MatchingItem } from '@orenji/api-client';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { CardPictures, pictureFor } from '../../../shared/catalog/card-pictures';
import { listingsLabel, ratingLabel, tagLabel } from '../../../shared/discovery/discovery-labels';
import {
  LAST_ACTIVE_LABELS,
  LastActiveBucket,
  distanceBucketLabel,
  lastActiveTone,
} from '../../../shared/domain/location-labels';
import {
  badgeFreshness,
  conditionLabel,
  formatPrice,
} from '../../../shared/inventory/inventory-labels';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import type { PreviewState } from '../data/map-discovery.store';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';

/**
 * Preview card of a collector chosen on the map or in the list (`GET /collectors/{handle}/preview`):
 * name, avatar, approximate distance, rating, tags, last activity, listing freshness and games,
 * with View profile / View public binder / Message (when the collector accepts messages from the
 * viewer; the map page opens the conversation in its Messages panel) and Report (signed in). Focus moves
 * into the card when it opens and returns where it was when it closes (Escape or the close button).
 */
@Component({
  selector: 'app-collector-preview-card',
  imports: [
    CardImageComponent,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    AvatarComponent,
    ErrorStateComponent,
    FreshnessBadgeComponent,
    GameChipComponent,
    SkeletonComponent,
  ],
  template: `
    @let s = state();
    <section
      class="preview"
      role="dialog"
      aria-modal="false"
      [attr.aria-labelledby]="titleId"
      [attr.aria-busy]="s.kind === 'loading'"
      tabindex="-1"
      (keydown.escape)="closed.emit()"
    >
      <button
        matIconButton
        type="button"
        class="preview__close"
        aria-label="Close preview"
        (click)="closed.emit()"
      >
        <mat-icon>close</mat-icon>
      </button>

      @switch (s.kind) {
        @case ('loading') {
          <div class="preview__head">
            <app-skeleton class="preview__avatar-bone" width="56px" height="56px" />
            <div class="preview__names">
              <h2 class="preview__name" [id]="titleId">
                {{ s.marker?.displayName ?? 'Loading collector' }}
              </h2>
              <app-skeleton width="60%" height="14px" />
            </div>
          </div>
          <app-skeleton variant="list" lines="3" />
        }
        @case ('not-found') {
          <h2 class="preview__name" [id]="titleId">Collector unavailable</h2>
          <p class="preview__muted">
            This collector is no longer on the map. Their profile may have become private.
          </p>
        }
        @case ('error') {
          <h2 class="visually-hidden" [id]="titleId">Collector preview</h2>
          <app-error-state
            compact
            title="The preview could not load"
            [message]="errorMessage()"
            [requestId]="s.error.requestId"
            (retry)="retry.emit()"
          />
        }
        @case ('ready') {
          @let p = s.preview;
          <div class="preview__head">
            <span class="preview__avatar">
              <app-avatar
                size="lg"
                [src]="p.avatarUrl"
                [name]="p.displayName"
                [decorative]="true"
              />
              @if (p.onlineStatus === 'ONLINE') {
                <span class="preview__online" role="img" aria-label="Online now"></span>
              }
            </span>
            <div class="preview__names">
              <h2 class="preview__name" [id]="titleId">{{ p.displayName }}</h2>
              <p class="preview__handle">&#64;{{ p.handle }}</p>
              <p class="preview__place">
                <mat-icon aria-hidden="true">location_on</mat-icon>{{ p.publicLabel }}
              </p>
            </div>
          </div>

          <ul class="preview__facts" aria-label="About this collector">
            <li data-testid="preview-distance">
              <mat-icon aria-hidden="true">near_me</mat-icon>
              {{ distance() }}
            </li>
            <li>
              <mat-icon aria-hidden="true">star</mat-icon>
              {{ rating() }}
            </li>
            @if (lastActive(); as active) {
              <li class="preview__activity" [attr.data-tone]="activityTone()">
                <span class="preview__dot" aria-hidden="true"></span>{{ active }}
              </li>
            }
          </ul>

          <app-freshness-badge
            class="preview__fresh"
            [state]="freshness()"
            [label]="listings()"
            data-testid="preview-freshness"
          />

          @if (p.games.length) {
            <ul class="preview__chips" aria-label="Games">
              @for (game of p.games; track game) {
                <li><app-game-chip [slug]="game" /></li>
              }
            </ul>
          }
          @if (p.tags.length) {
            <ul class="preview__tags" aria-label="Tags">
              @for (tag of p.tags; track tag) {
                <li>{{ tag_(tag) }}</li>
              }
            </ul>
          }
          @if (matchingItems().length) {
            <ul
              class="preview__items"
              data-testid="preview-matching-items"
              [attr.aria-label]="'Listings of this card by ' + p.displayName"
            >
              @for (item of matchingItems(); track item.itemId) {
                <li class="preview__item">
                  <app-card-image
                    size="xs"
                    [src]="picture(item)"
                    [alt]="item.cardName"
                    [game]="item.game"
                  />
                  <span class="preview__item-text">
                    <span class="mono">{{ item.printingCode ?? item.cardName }}</span>
                    <span class="preview__muted">{{ condition(item.condition) }}</span>
                  </span>
                  <strong class="preview__item-price">{{ price(item) }}</strong>
                </li>
              }
            </ul>
          }

          <div class="preview__actions">
            <a matButton="filled" [routerLink]="['/collectors', p.handle]">
              <mat-icon aria-hidden="true">person</mat-icon>
              View profile
            </a>
            @if (binderId(); as id) {
              <a matButton="outlined" [routerLink]="['/binders', id]">
                <mat-icon aria-hidden="true">menu_book</mat-icon>
                View public binder
              </a>
            } @else {
              <button
                matButton="outlined"
                type="button"
                disabled
                disabledInteractive
                [matTooltip]="
                  binderId() === undefined ? 'Loading public binders…' : 'No public binder yet'
                "
              >
                <mat-icon aria-hidden="true">menu_book</mat-icon>
                View public binder
              </button>
            }
            @if (!isSelf()) {
              @if (!signedIn()) {
                <a matButton routerLink="/auth/sign-in" [queryParams]="{ returnUrl: '/map' }">
                  <mat-icon aria-hidden="true">chat</mat-icon>
                  Sign in to message
                </a>
              } @else if (p.canMessage) {
                <button
                  matButton="tonal"
                  type="button"
                  [disabled]="messaging()"
                  [attr.aria-label]="'Message ' + p.displayName"
                  (click)="messageRequested.emit(p)"
                >
                  <mat-icon aria-hidden="true">chat</mat-icon>
                  {{ messaging() ? 'Opening…' : 'Message' }}
                </button>
              } @else {
                <button
                  matButton
                  type="button"
                  disabled
                  disabledInteractive
                  [matTooltip]="
                    p.isBlocked
                      ? 'Messaging is unavailable because of a block'
                      : p.displayName + ' does not accept messages from you'
                  "
                >
                  <mat-icon aria-hidden="true">chat</mat-icon>
                  Message
                </button>
              }
              @if (signedIn()) {
                <button
                  matIconButton
                  type="button"
                  class="preview__report"
                  [attr.aria-label]="'Report ' + p.displayName"
                  matTooltip="Report this collector"
                  (click)="reportRequested.emit(p)"
                >
                  <mat-icon>flag</mat-icon>
                </button>
              }
            }
          </div>
        }
      }
    </section>
  `,
  styleUrl: './collector-preview-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorPreviewCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly doc = inject(DOCUMENT);

  readonly state = input.required<PreviewState>();
  /** First public binder: `undefined` while loading, `null` when there is none. */
  readonly binderId = input<string | null | undefined>(undefined);
  readonly signedIn = input(false);
  /** The previewed collector is the viewer (no Message button). */
  readonly isSelf = input(false);
  /** The conversation with this collector is being opened. */
  readonly messaging = input(false);
  /** Holders mode: the collector's listings of the card (from their map marker). */
  readonly matchingItems = input<readonly MatchingItem[]>([]);
  /** Holders mode: pictures of the card and its printings. */
  readonly pictures = input<CardPictures | null>(null);
  readonly closed = output<void>();
  /** "Message" pressed: open or start the conversation. */
  readonly messageRequested = output<CollectorPreview>();
  /** "Report" pressed (signed-in viewers, other collectors). */
  readonly reportRequested = output<CollectorPreview>();
  readonly retry = output<void>();

  protected readonly titleId = `collector-preview-title-${Math.random().toString(36).slice(2, 8)}`;

  private readonly ready = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.preview : null;
  });
  protected readonly distance = computed(() => {
    const preview = this.ready();
    if (this.isSelf()) {
      return 'Your public position';
    }
    if (!this.signedIn()) {
      return 'Sign in to see distances';
    }
    return distanceBucketLabel(preview?.distanceBucket) ?? 'Distance hidden';
  });
  protected readonly rating = computed(() => ratingLabel(this.ready()?.rating));
  protected readonly lastActive = computed(() => {
    const bucket = this.ready()?.lastActiveBucket;
    return bucket && bucket !== 'HIDDEN' ? LAST_ACTIVE_LABELS[bucket as LastActiveBucket] : null;
  });
  protected readonly activityTone = computed(() =>
    lastActiveTone(this.ready()?.lastActiveBucket ?? 'HIDDEN'),
  );
  protected readonly freshness = computed(() => badgeFreshness(this.ready()?.binderFreshness));
  protected readonly listings = computed(() => {
    const preview = this.ready();
    return preview ? listingsLabel(preview) : '';
  });
  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.kind === 'error' ? friendlyMessage(state.error) : '';
  });

  constructor() {
    const previous = this.doc.activeElement as HTMLElement | null;
    afterNextRender(() => {
      this.host.nativeElement.querySelector<HTMLElement>('.preview')?.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      const active = this.doc.activeElement;
      const focusLost =
        !active || active === this.doc.body || this.host.nativeElement.contains(active);
      if (focusLost && previous?.isConnected && previous !== this.doc.body) {
        previous.focus();
      }
    });
  }

  protected tag_(slug: string): string {
    return tagLabel(slug);
  }

  protected picture(item: MatchingItem): string | null {
    return pictureFor(this.pictures(), item.printingId);
  }

  protected condition(code: string): string {
    return conditionLabel(code);
  }

  protected price(item: MatchingItem): string {
    return (
      formatPrice(item.askingPrice, item.currency) ??
      (item.acceptsOffers ? 'Make an offer' : 'No price')
    );
  }
}
