import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import type { WishlistMatchResponse } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { ratingLabel } from '../../../shared/discovery/discovery-labels';
import {
  LAST_ACTIVE_LABELS,
  LastActiveBucket,
  distanceBucketLabel,
  lastActiveTone,
} from '../../../shared/domain/location-labels';
import {
  badgeFreshness,
  formatPrice,
  printingCode,
  printingImageUrl,
} from '../../../shared/inventory/inventory-labels';
import { ItemChipsComponent } from '../../../shared/inventory/item-chips/item-chips.component';
import { MakeOfferButtonComponent } from '../../../shared/offers/make-offer-button.component';
import { offerTargetFromItem, sellerFromMarker } from '../../../shared/offers/offer-target';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';

/**
 * One match of a wish: the collector (marker data: name, approximate place, distance bucket,
 * rating, activity) and the matching public item (picture, printing, condition / availability /
 * offers chips, price, freshness, public note), with Message, View binder, On the map and
 * Dismiss. Never a coordinate: places and distances are the server's approximations.
 */
@Component({
  selector: 'app-wish-match-card',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    AvatarComponent,
    CardImageComponent,
    FreshnessBadgeComponent,
    ItemChipsComponent,
    MakeOfferButtonComponent,
    RelativeTimePipe,
  ],
  template: `
    @let m = match();
    @let c = m.collector;
    <article class="mc" [attr.aria-label]="'Match from ' + c.displayName" [attr.data-match]="m.id">
      <div class="mc__who">
        <span class="mc__avatar">
          <app-avatar size="md" [src]="c.avatarUrl" [name]="c.displayName" [decorative]="true" />
          @if (c.onlineStatus === 'ONLINE') {
            <span class="mc__online" role="img" aria-label="Online now"></span>
          }
        </span>
        <div class="mc__names">
          <a class="mc__name" [routerLink]="['/collectors', c.handle]" (click)="navigate.emit()">{{
            c.displayName
          }}</a>
          <p class="mc__place">
            <mat-icon aria-hidden="true">location_on</mat-icon>
            <span>{{ c.publicLabel }}</span>
            @if (distance(); as distance) {
              <span class="mc__distance" data-testid="match-distance">{{ distance }}</span>
            }
          </p>
          <p class="mc__facts">
            <span><mat-icon aria-hidden="true">star</mat-icon>{{ rating() }}</span>
            @if (lastActive(); as active) {
              <span class="mc__active" [attr.data-tone]="activeTone()">
                <span class="mc__dot" aria-hidden="true"></span>{{ active }}
              </span>
            }
          </p>
        </div>
        <button
          matIconButton
          type="button"
          class="mc__dismiss"
          [disabled]="dismissing()"
          [attr.aria-label]="'Dismiss the match from ' + c.displayName"
          matTooltip="Dismiss this match"
          (click)="dismiss.emit()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="mc__item">
        <app-card-image
          class="mc__img"
          [src]="image()"
          [alt]="m.item.card.name"
          [game]="m.item.card.game"
        />
        <div class="mc__item-body">
          <p class="mc__code">
            <span class="mono">{{ code() }}</span>
            @if (m.item.printing.setName) {
              · {{ m.item.printing.setName }}
            }
          </p>
          <p class="mc__meta">{{ details() }}</p>
          <app-item-chips
            [condition]="m.item.condition"
            [availability]="m.item.availability"
            [acceptsOffers]="m.item.acceptsOffers"
          />
          <div class="mc__price-row">
            @if (price(); as price) {
              <span class="mc__price" data-testid="match-price">{{ price }}</span>
            } @else {
              <span class="mc__price mc__price--none" data-testid="match-price">No price</span>
            }
            <app-freshness-badge compact [state]="freshness()" [label]="m.item.freshness.label" />
          </div>
          @if (m.item.publicNotes) {
            <p class="mc__note">“{{ m.item.publicNotes }}”</p>
          }
        </div>
      </div>

      <div class="mc__actions">
        <button
          matButton="filled"
          type="button"
          [disabled]="messaging()"
          [attr.aria-label]="'Message ' + c.displayName"
          (click)="messageRequested.emit()"
        >
          <mat-icon aria-hidden="true">chat</mat-icon>
          {{ messaging() ? 'Opening…' : 'Message' }}
        </button>
        <app-make-offer-button appearance="outlined" [target]="offerTarget()" />
        @if (m.item.binder; as binder) {
          <a matButton="outlined" [routerLink]="['/binders', binder.id]" (click)="navigate.emit()">
            <mat-icon aria-hidden="true">menu_book</mat-icon>
            View binder
          </a>
        }
        <a matButton routerLink="/map" [queryParams]="mapQuery()" (click)="navigate.emit()">
          <mat-icon aria-hidden="true">map</mat-icon>
          On the map
        </a>
      </div>
      <p class="mc__when">
        Matched <time [attr.datetime]="m.matchedAt">{{ m.matchedAt | relativeTime }}</time>
      </p>
    </article>
  `,
  styles: `
    :host {
      display: block;
    }
    .mc {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-3);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .mc__who {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
    }
    .mc__avatar {
      position: relative;
      flex: 0 0 auto;
    }
    .mc__online {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--color-online-online);
      box-shadow: 0 0 0 2px var(--color-surface);
    }
    .mc__names {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .mc__name {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .mc__name:hover {
      color: var(--color-primary);
    }
    .mc__place,
    .mc__facts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .mc__place mat-icon,
    .mc__facts mat-icon {
      width: 16px;
      height: 16px;
      margin-right: 2px;
      font-size: 16px;
      vertical-align: -3px;
    }
    .mc__distance {
      padding: 1px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .mc__active {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .mc__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-status-hidden);
    }
    .mc__active[data-tone='fresh'] .mc__dot {
      background: var(--color-status-fresh);
    }
    .mc__active[data-tone='aging'] .mc__dot {
      background: var(--color-status-aging);
    }
    .mc__dismiss {
      flex: 0 0 auto;
      margin: -8px -8px 0 0;
    }
    .mc__item {
      display: flex;
      gap: var(--spacing-3);
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .mc__img {
      flex: 0 0 76px;
      width: 76px;
    }
    .mc__item-body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .mc__code {
      margin: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .mc__meta,
    .mc__when {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .mc__price-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-top: auto;
    }
    .mc__price {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
    }
    .mc__price--none {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-regular);
    }
    .mc__note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-style: italic;
    }
    .mc__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishMatchCardComponent {
  readonly match = input.required<WishlistMatchResponse>();

  protected readonly offerTarget = computed(() =>
    offerTargetFromItem(this.match().item, sellerFromMarker(this.match().collector)),
  );
  /** The conversation with this collector is being opened. */
  readonly messaging = input(false);
  readonly dismissing = input(false);

  readonly messageRequested = output<void>();
  readonly dismiss = output<void>();
  /** A link inside the card was followed (the drawer closes). */
  readonly navigate = output<void>();

  protected readonly distance = computed(() =>
    distanceBucketLabel(this.match().distanceBucket ?? this.match().collector.distanceBucket),
  );
  protected readonly rating = computed(() => ratingLabel(this.match().collector.rating));
  protected readonly lastActive = computed(() => {
    const bucket = this.match().collector.lastActiveBucket;
    return bucket === 'HIDDEN' ? null : (LAST_ACTIVE_LABELS[bucket as LastActiveBucket] ?? null);
  });
  protected readonly activeTone = computed(() =>
    lastActiveTone(this.match().collector.lastActiveBucket),
  );
  protected readonly image = computed(
    () => this.match().item.images[0]?.url ?? printingImageUrl(this.match().item.printing),
  );
  protected readonly code = computed(() => printingCode(this.match().item.printing));
  protected readonly details = computed(() => {
    const item = this.match().item;
    return [languageLabel(item.language), editionLabel(item.edition)]
      .filter((part) => part && part !== '—')
      .join(' · ');
  });
  protected readonly price = computed(() =>
    formatPrice(this.match().item.askingPrice, this.match().item.currency),
  );
  protected readonly freshness = computed(() => badgeFreshness(this.match().item.freshness.state));
  /** Holders of this printing on the map (the list shows who they are). */
  protected readonly mapQuery = computed(() => {
    const item = this.match().item;
    return item.printing.id
      ? { printing: item.printing.id, view: 'list' }
      : { card: item.card.id, view: 'list' };
  });
}
