import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CollectorMarker, MatchingItem } from '@orenji/api-client';
import { CardPictures, pictureFor } from '../../../shared/catalog/card-pictures';
import { listingsLabel, ratingLabel, tagLabel } from '../../../shared/discovery/discovery-labels';
import { badgeFreshness, formatPrice } from '../../../shared/inventory/inventory-labels';
import { ItemChipsComponent } from '../../../shared/inventory/item-chips/item-chips.component';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';

/**
 * A collector in search results: avatar, name (profile link), state/province and country,
 * listing freshness, games and tags, and, for card searches, their listings of the card.
 */
@Component({
  selector: 'app-collector-result',
  imports: [
    CardImageComponent,
    RouterLink,
    AvatarComponent,
    FreshnessBadgeComponent,
    GameChipComponent,
    ItemChipsComponent,
  ],
  template: `
    @let c = collector();
    <article class="cr" [attr.aria-label]="c.displayName">
      <app-avatar size="lg" [src]="c.avatarUrl" [name]="c.displayName" [decorative]="true" />
      <div class="cr__body">
        <h3 class="cr__name">
          <a class="cr__link" [routerLink]="['/collectors', c.handle]">{{ c.displayName }}</a>
        </h3>
        <p class="cr__meta">&#64;{{ c.handle }} · {{ c.place.label }}</p>
        <p class="cr__meta">{{ rating() }}</p>
        <div class="cr__badges">
          <app-freshness-badge compact [state]="freshness()" [label]="listings()" />
          @for (game of c.games; track game) {
            <app-game-chip [slug]="game" />
          }
        </div>
        @if (c.tags.length) {
          <p class="cr__tags">{{ tags() }}</p>
        }
        @if (c.matchingItems.length) {
          <ul class="cr__items" [attr.aria-label]="'Listings of ' + c.displayName">
            @for (item of c.matchingItems; track item.itemId) {
              <li class="cr__item">
                <app-card-image
                  size="xs"
                  [src]="picture(item)"
                  [alt]="item.cardName"
                  [game]="item.game"
                />
                <span class="mono">{{ item.printingCode ?? item.cardName }}</span>
                <app-item-chips
                  [condition]="item.condition"
                  [availability]="item.availability"
                  [acceptsOffers]="item.acceptsOffers"
                />
                <strong data-testid="holder-price">{{
                  price(item.askingPrice, item.currency, item.acceptsOffers)
                }}</strong>
              </li>
            }
          </ul>
        }
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .cr {
      position: relative;
      display: flex;
      gap: var(--spacing-3);
      height: 100%;
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition: box-shadow var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .cr:hover,
    .cr:focus-within {
      box-shadow: var(--elevation-menu);
    }
    .cr__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .cr__name {
      font-size: var(--font-size-lg);
    }
    .cr__link {
      color: var(--color-ink);
      text-decoration: none;
    }
    .cr__link:hover {
      color: var(--color-primary);
    }
    .cr__meta,
    .cr__tags {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .cr__badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1);
      align-items: center;
    }
    .cr__items {
      display: grid;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      padding: var(--spacing-2) 0 0;
      border-top: 1px dashed var(--color-border);
      list-style: none;
    }
    .cr__item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorResultComponent {
  readonly collector = input.required<CollectorMarker>();
  readonly signedIn = input(false);
  /** Pictures of the searched card (listing thumbnails); `null` shows the placeholder art. */
  readonly pictures = input<CardPictures | null>(null);

  protected readonly rating = computed(() => ratingLabel(this.collector().rating));
  protected readonly freshness = computed(() => badgeFreshness(this.collector().binderFreshness));
  protected readonly listings = computed(() => listingsLabel(this.collector()));
  protected readonly tags = computed(() =>
    this.collector()
      .tags.map((tag) => tagLabel(tag))
      .join(' · '),
  );

  protected picture(item: MatchingItem): string | null {
    return pictureFor(this.pictures(), item.printingId);
  }

  protected price(amount: number | null | undefined, currency: string, offers: boolean): string {
    return formatPrice(amount, currency) ?? (offers ? 'Make an offer' : 'No price');
  }
}
