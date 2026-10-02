import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { OfferTradeItem, PublicInventoryItem } from '@orenji/api-client';
import { CardImageComponent } from '../ui/card-image/card-image.component';
import {
  conditionLabel,
  formatPrice,
  printingCode,
  printingImageUrl,
} from '../inventory/inventory-labels';
import { ItemChipsComponent } from '../inventory/item-chips/item-chips.component';
import { OFFER_KIND_INFO, OfferKind, kindHasCards, kindHasCash } from './offer-labels';

/**
 * The deal of an offer or a trade, side by side: what the seller gives (their public card) and
 * what the buyer gives (the cash part and/or their cards with copies), then the proposing party's
 * note. Cards link to the catalog. Purged cards (a deleted account) show as unavailable.
 */
@Component({
  selector: 'app-deal-summary',
  imports: [RouterLink, MatIconModule, CardImageComponent, ItemChipsComponent],
  template: `
    <div class="deal">
      <section class="side" [attr.aria-label]="gives(sellerName())">
        <p class="side__who">{{ gives(sellerName()) }}</p>
        @if (item(); as it) {
          <div class="card">
            <app-card-image
              class="card__img"
              [src]="imageOf(it)"
              [game]="it.card.game"
              [alt]="it.card.name"
            />
            <div class="card__body">
              <a
                class="card__name"
                [routerLink]="['/cards', it.card.id]"
                [queryParams]="it.printing.id ? { printing: it.printing.id } : {}"
                >{{ it.card.name }}</a
              >
              <p class="card__meta">
                <span class="mono">{{ codeOf(it) }}</span>
                @if (it.printing.setName) {
                  · {{ it.printing.setName }}
                }
              </p>
              <app-item-chips
                [condition]="it.condition"
                [availability]="it.availability"
                [acceptsOffers]="it.acceptsOffers"
              />
              @if (asking(); as asking) {
                <p class="card__meta">Asking {{ asking }}</p>
              }
            </div>
          </div>
        } @else {
          <p class="gone">This card is no longer available.</p>
        }
      </section>

      <span class="swap" aria-hidden="true"><mat-icon>swap_horiz</mat-icon></span>

      <section class="side side--offer" [attr.aria-label]="gives(buyerName())">
        <p class="side__who">
          {{ gives(buyerName()) }}
          <span class="kind">
            <mat-icon aria-hidden="true">{{ kindInfo().icon }}</mat-icon>
            {{ kindInfo().label }}
          </span>
        </p>
        @if (hasCash()) {
          <p class="cash" data-testid="deal-cash">{{ cash() }}</p>
        }
        @if (hasCards()) {
          @if (hasCash()) {
            <p class="plus">plus</p>
          }
          <ul class="cards" aria-label="Cards in the deal" data-testid="deal-cards">
            @for (line of tradeItems(); track $index) {
              <li class="line">
                @if (line.item; as card) {
                  <app-card-image
                    class="line__img"
                    [src]="imageOf(card)"
                    [game]="card.card.game"
                    [alt]="card.card.name"
                  />
                  <span class="line__text">
                    <a
                      class="line__name"
                      [routerLink]="['/cards', card.card.id]"
                      [queryParams]="card.printing.id ? { printing: card.printing.id } : {}"
                      >{{ card.card.name }}</a
                    >
                    <span class="line__meta">
                      <span class="mono">{{ codeOf(card) }}</span> · {{ conditionOf(card) }}
                    </span>
                  </span>
                } @else {
                  <span class="line__text"><span class="gone">Card no longer available</span></span>
                }
                <span class="line__qty" [attr.aria-label]="line.quantity + ' copies'"
                  >×{{ line.quantity }}</span
                >
              </li>
            }
          </ul>
        }
      </section>
    </div>
    @if (message()) {
      <blockquote class="note">
        <mat-icon aria-hidden="true">format_quote</mat-icon>
        <p>
          <span class="note__text" data-testid="deal-message">{{ message() }}</span>
          @if (messageAuthor()) {
            <span class="note__author">— {{ messageAuthor() }}</span>
          }
        </p>
      </blockquote>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .deal {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: stretch;
      gap: var(--spacing-3);
    }
    .side {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      min-width: 0;
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .side--offer {
      border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
      background: color-mix(in srgb, var(--color-primary) 5%, var(--color-surface));
    }
    .side__who {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .kind {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-ink);
      letter-spacing: normal;
      text-transform: none;
    }
    .kind mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .card {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      gap: var(--spacing-3);
    }
    .card__body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .card__name,
    .line__name {
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-decoration: none;
    }
    .card__name {
      font-family: var(--font-display);
      font-size: var(--font-size-lg);
    }
    .card__name:hover,
    .line__name:hover {
      color: var(--color-primary);
      text-decoration: underline;
    }
    .card__meta,
    .line__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .swap {
      display: grid;
      place-items: center;
      align-self: center;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--color-primary);
      color: var(--color-on-primary);
      box-shadow: var(--elevation-floating);
    }
    .cash {
      margin: 0;
      color: var(--color-ink);
      font-family: var(--font-display);
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-bold);
      line-height: 1.1;
    }
    .plus {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .line {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
    }
    .line__img {
      flex: 0 0 auto;
      width: 40px;
    }
    .line__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .line__qty {
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .gone {
      margin: 0;
      color: var(--color-text-muted);
      font-style: italic;
    }
    .note {
      display: flex;
      gap: var(--spacing-2);
      margin: var(--spacing-4) 0 0;
      padding: var(--spacing-3) var(--spacing-4);
      border-left: 3px solid var(--color-accent);
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
      background: var(--color-surface-variant);
    }
    .note mat-icon {
      flex: 0 0 auto;
      color: var(--color-accent);
    }
    .note p {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
    }
    .note__text {
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .note__author {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    @media (max-width: 719px) {
      .deal {
        grid-template-columns: minmax(0, 1fr);
      }
      .swap {
        transform: rotate(90deg);
      }
      .card {
        grid-template-columns: 72px minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DealSummaryComponent {
  /** The seller's card; `null` once the owner's account was purged. */
  readonly item = input<PublicInventoryItem | null | undefined>(null);
  readonly kind = input.required<string>();
  readonly cashAmount = input<number | null | undefined>(null);
  readonly currency = input<string | null | undefined>(null);
  readonly tradeItems = input<readonly OfferTradeItem[]>([]);
  readonly message = input<string | null | undefined>(null);
  /** Who wrote the note ("You", "Devon"). */
  readonly messageAuthor = input<string | null>(null);
  readonly sellerName = input('The seller');
  readonly buyerName = input('The buyer');

  protected readonly kindInfo = computed(
    () => OFFER_KIND_INFO[this.kind() as OfferKind] ?? OFFER_KIND_INFO.CASH,
  );
  protected readonly hasCash = computed(() => kindHasCash(this.kind() as OfferKind));
  protected readonly hasCards = computed(
    () => kindHasCards(this.kind() as OfferKind) && this.tradeItems().length > 0,
  );
  protected readonly cash = computed(
    () => formatPrice(this.cashAmount(), this.currency() ?? undefined) ?? '—',
  );
  protected readonly asking = computed(() => {
    const item = this.item();
    return item ? formatPrice(item.askingPrice, item.currency) : null;
  });

  /** "You give" / "Devon gives". */
  protected gives(name: string): string {
    return name === 'You' ? 'You give' : `${name} gives`;
  }

  protected imageOf(item: PublicInventoryItem): string | null {
    return item.images[0]?.url ?? printingImageUrl(item.printing);
  }

  protected codeOf(item: PublicInventoryItem): string {
    return printingCode(item.printing);
  }

  protected conditionOf(item: PublicInventoryItem): string {
    return conditionLabel(item.condition);
  }
}
