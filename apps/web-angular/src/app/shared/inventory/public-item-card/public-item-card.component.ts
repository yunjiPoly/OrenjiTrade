import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicInventoryItem } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../../catalog/catalog-labels';
import { CardImageComponent } from '../../ui/card-image/card-image.component';
import { gameInfo } from '../../domain/games';
import { FreshnessBadgeComponent } from '../../ui/freshness-badge/freshness-badge.component';
import { badgeFreshness, formatPrice, printingCode, printingImageUrl } from '../inventory-labels';
import { ItemChipsComponent } from '../item-chips/item-chips.component';
import { MakeOfferButtonComponent } from '../../offers/make-offer-button.component';
import { OfferSeller, offerTargetFromItem } from '../../offers/offer-target';

/**
 * A public inventory item (public binder page, collector page): picture, card name (links to the
 * catalog card), printing code, condition / availability / offers chips, price, quantity,
 * freshness and the owner's public note. Never private notes (the API does not send them).
 * With its `seller`, the card offers "Make an offer" (when the card accepts offers and is not the
 * viewer's own).
 */
@Component({
  selector: 'app-public-item-card',
  imports: [
    RouterLink,
    CardImageComponent,
    FreshnessBadgeComponent,
    ItemChipsComponent,
    MakeOfferButtonComponent,
  ],
  template: `
    @let it = item();
    <article class="pic" [style.--pic-accent]="accent()" [attr.aria-label]="it.card.name">
      <div class="pic__media">
        <app-card-image [src]="image()" [alt]="it.card.name" [game]="it.card.game" />
        @if (it.quantity > 1) {
          <span class="pic__qty" [attr.aria-label]="it.quantity + ' copies'"
            >×{{ it.quantity }}</span
          >
        }
      </div>
      <div class="pic__body">
        <h3 class="pic__name">
          <a
            class="pic__link"
            [routerLink]="['/cards', it.card.id]"
            [queryParams]="it.printing.id ? { printing: it.printing.id } : {}"
            >{{ it.card.name }}</a
          >
        </h3>
        <p class="pic__meta">
          <span class="mono">{{ code() }}</span>
          @if (it.printing.setName) {
            · {{ it.printing.setName }}
          }
        </p>
        <p class="pic__meta">{{ details() }}</p>
        <app-item-chips
          [condition]="it.condition"
          [availability]="it.availability"
          [acceptsOffers]="it.acceptsOffers"
        />
        <div class="pic__footer">
          @if (price(); as price) {
            <span class="pic__price" data-testid="item-price">{{ price }}</span>
          } @else {
            <span class="pic__price pic__price--none">No price</span>
          }
          <app-freshness-badge compact [state]="freshness()" [label]="it.freshness.label" />
        </div>
        @if (it.publicNotes) {
          <p class="pic__note">“{{ it.publicNotes }}”</p>
        }
        @if (offerTarget(); as target) {
          <app-make-offer-button class="pic__offer" appearance="tonal" compact [target]="target" />
        }
      </div>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .pic {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      transition:
        transform var(--motion-duration-fast) var(--motion-easing-standard),
        box-shadow var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .pic:hover,
    .pic:focus-within {
      transform: translateY(-2px);
      box-shadow: var(--elevation-menu);
    }
    .pic__media {
      position: relative;
      margin-bottom: var(--spacing-3);
    }
    .pic__qty {
      position: absolute;
      right: 6px;
      bottom: 6px;
      padding: 1px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: rgb(0 0 0 / 0.72);
      color: #fff;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .pic__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .pic__name {
      font-family: var(--font-body);
      font-size: var(--font-size-md);
      line-height: 1.3;
    }
    .pic__link {
      color: var(--color-ink);
      text-decoration: none;
    }
    .pic__link:hover {
      color: var(--pic-accent);
    }
    .pic__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .pic__footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin-top: auto;
      padding-top: var(--spacing-2);
    }
    .pic__price {
      font-weight: var(--font-weight-semibold);
      font-size: var(--font-size-md);
    }
    .pic__price--none {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-regular);
    }
    .pic__offer {
      margin-top: var(--spacing-2);
    }
    .pic__offer:empty {
      display: none;
    }
    .pic__note {
      margin: var(--spacing-1) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-style: italic;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicItemCardComponent {
  readonly item = input.required<PublicInventoryItem>();
  /** The owner: enables "Make an offer" (public binder page, collector page). */
  readonly seller = input<OfferSeller | null>(null);

  protected readonly offerTarget = computed(() => {
    const seller = this.seller();
    return seller ? offerTargetFromItem(this.item(), seller) : null;
  });

  protected readonly image = computed(
    () => this.item().images[0]?.url ?? printingImageUrl(this.item().printing),
  );
  protected readonly code = computed(() => printingCode(this.item().printing));
  protected readonly price = computed(() =>
    formatPrice(this.item().askingPrice, this.item().currency),
  );
  protected readonly freshness = computed(() => badgeFreshness(this.item().freshness.state));
  protected readonly accent = computed(() => `var(${gameInfo(this.item().card.game).colorVar})`);
  protected readonly details = computed(() => {
    const item = this.item();
    return [languageLabel(item.language), editionLabel(item.edition)]
      .filter((part) => part && part !== '—')
      .join(' · ');
  });
}
