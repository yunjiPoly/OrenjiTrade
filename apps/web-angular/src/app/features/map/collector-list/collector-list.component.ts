import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { CollectorMarker, MatchingItem } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import { listingsLabel } from '../../../shared/discovery/discovery-labels';
import { distanceBucketLabel } from '../../../shared/domain/location-labels';
import { badgeFreshness, formatPrice } from '../../../shared/inventory/inventory-labels';
import { ItemChipsComponent } from '../../../shared/inventory/item-chips/item-chips.component';
import { MakeOfferButtonComponent } from '../../../shared/offers/make-offer-button.component';
import { OfferTarget, offerTargetFromMatch } from '../../../shared/offers/offer-target';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';

/**
 * The collectors of the map as an accessible list (keyboard alternative to the markers). In
 * "holders" mode each collector shows the listings of the card: printing, condition /
 * availability / offers chips, price, freshness and "Make an offer". Choosing a collector opens
 * its preview.
 */
@Component({
  selector: 'app-collector-list',
  imports: [
    AvatarComponent,
    FreshnessBadgeComponent,
    GameChipComponent,
    ItemChipsComponent,
    MakeOfferButtonComponent,
  ],
  template: `
    <ul class="list" [attr.aria-label]="label()">
      @for (collector of collectors(); track collector.id) {
        <li
          class="row"
          [class.row--selected]="collector.handle === selectedHandle()"
          [attr.data-handle]="collector.handle"
        >
          <app-avatar
            size="md"
            [src]="collector.avatarUrl"
            [name]="collector.displayName"
            [decorative]="true"
          />
          <div class="row__body">
            <h3 class="row__name">
              <button
                type="button"
                class="row__button"
                [attr.aria-current]="collector.handle === selectedHandle() ? 'true' : null"
                (click)="selected.emit(collector.handle)"
              >
                {{ collector.displayName }}
              </button>
              @if (collector.id === selfId()) {
                <span class="row__you">You</span>
              }
            </h3>
            <p class="row__meta">
              {{ collector.publicLabel }}
              @if (distance(collector); as distance) {
                · {{ distance }}
              }
            </p>
            <div class="row__badges">
              <app-freshness-badge
                compact
                [state]="freshness(collector)"
                [label]="listings(collector)"
              />
              @if (!holders()) {
                @for (game of collector.games.slice(0, 2); track game) {
                  <app-game-chip class="row__game" [slug]="game" />
                }
              }
            </div>
            @if (holders() && collector.matchingItems.length) {
              <ul class="row__items" [attr.aria-label]="'Listings of ' + collector.displayName">
                @for (item of collector.matchingItems; track item.itemId) {
                  <li class="item">
                    <span class="item__code mono">{{ item.printingCode ?? item.cardName }}</span>
                    <span class="item__meta">{{ itemMeta(item) }}</span>
                    <app-item-chips
                      [condition]="item.condition"
                      [availability]="item.availability"
                      [acceptsOffers]="item.acceptsOffers"
                    />
                    <span class="item__price" data-testid="holder-price">{{ price(item) }}</span>
                    <app-make-offer-button
                      class="item__offer"
                      appearance="outlined"
                      compact
                      [target]="offerTarget(item, collector)"
                    />
                  </li>
                }
              </ul>
            }
          </div>
        </li>
      }
    </ul>
  `,
  styleUrl: './collector-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectorListComponent {
  readonly collectors = input.required<readonly CollectorMarker[]>();
  readonly selectedHandle = input<string | null>(null);
  /** Show each collector's listings of the card (holders mode). */
  readonly holders = input(false);
  readonly signedIn = input(false);
  /** The viewer's own account id (their marker stays on the map, labelled "You"). */
  readonly selfId = input<string | null>(null);
  readonly label = input('Collectors on the map');
  readonly selected = output<string>();

  private readonly anonymous = computed(() => !this.signedIn());

  protected distance(collector: CollectorMarker): string | null {
    return this.anonymous() ? null : distanceBucketLabel(collector.distanceBucket);
  }

  protected freshness(collector: CollectorMarker) {
    return badgeFreshness(collector.binderFreshness);
  }

  protected listings(collector: CollectorMarker): string {
    return listingsLabel(collector);
  }

  protected itemMeta(item: MatchingItem): string {
    return [
      item.printingCode ? item.cardName : null,
      languageLabel(item.language),
      editionLabel(item.edition),
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** Offer targets are cached per listing so the button keeps a stable input. */
  private readonly targets = new Map<string, { source: MatchingItem; target: OfferTarget }>();

  protected offerTarget(item: MatchingItem, collector: CollectorMarker): OfferTarget {
    const cached = this.targets.get(item.itemId);
    if (cached && cached.source === item) {
      return cached.target;
    }
    const target = offerTargetFromMatch(item, collector);
    this.targets.set(item.itemId, { source: item, target });
    return target;
  }

  protected price(item: MatchingItem): string {
    return (
      formatPrice(item.askingPrice, item.currency) ??
      (item.acceptsOffers ? 'Make an offer' : 'No price')
    );
  }
}
