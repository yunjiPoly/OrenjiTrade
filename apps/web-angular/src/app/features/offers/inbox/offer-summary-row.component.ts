import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { OfferSummary } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import {
  expiryLabel,
  isLiveOffer,
  offerKindLabel,
  offerStatusInfo,
  offerTermsText,
} from '../../../shared/offers/offer-labels';
import { StatusChipComponent } from '../../../shared/offers/status-chip.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';

/**
 * One negotiation of the inbox: the card, the other collector (approximate place only), the
 * live terms, status, whose turn it is and the expiry. The whole row opens the offer page.
 */
@Component({
  selector: 'app-offer-summary-row',
  imports: [
    RouterLink,
    MatIconModule,
    AvatarComponent,
    CardImageComponent,
    RelativeTimePipe,
    StatusChipComponent,
  ],
  template: `
    @let o = offer();
    <a
      class="row"
      [class.row--turn]="o.yourTurn"
      [routerLink]="['/offers', o.id]"
      [attr.aria-label]="label()"
      data-testid="offer-row"
    >
      <app-card-image
        class="row__img"
        [src]="image()"
        [game]="o.item?.card?.game"
        [alt]="o.item?.card?.name ?? ''"
      />
      <span class="row__main">
        <span class="row__title">
          <span class="row__card">{{ o.item?.card?.name ?? 'Card no longer available' }}</span>
          @if (code()) {
            <span class="row__code mono">{{ code() }}</span>
          }
        </span>
        <span class="row__who">
          <app-avatar
            size="xs"
            [src]="o.counterparty.avatarUrl"
            [name]="o.counterparty.displayName"
            [decorative]="true"
          />
          {{ o.viewerRole === 'SELLER' ? 'From' : 'To' }} {{ o.counterparty.displayName }}
          @if (o.counterparty.location?.publicLabel; as place) {
            <span class="row__muted">· {{ place }}</span>
          }
        </span>
        <span class="row__terms">
          <span class="row__kind">{{ kind() }}</span>
          <strong data-testid="offer-row-terms">{{ terms() }}</strong>
        </span>
      </span>
      <span class="row__side">
        <app-status-chip [label]="status().label" [icon]="status().icon" [tone]="status().tone" />
        @if (o.yourTurn) {
          <span class="row__turn" data-testid="your-turn">
            <mat-icon aria-hidden="true">notifications_active</mat-icon>
            Your turn
          </span>
        } @else if (live()) {
          <span class="row__muted">Waiting for {{ o.counterparty.displayName }}</span>
        }
        @if (live() && expiry(); as expiry) {
          <span class="row__muted">{{ expiry }}</span>
        } @else {
          <span class="row__muted">{{ o.updatedAt | relativeTime }}</span>
        }
      </span>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .row {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--spacing-4);
      padding: var(--spacing-3) var(--spacing-4);
      color: inherit;
      text-decoration: none;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .row:hover {
      background: var(--color-surface-variant);
    }
    .row:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: calc(var(--focus-width) * -1);
    }
    .row--turn {
      background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
      box-shadow: inset 3px 0 0 var(--color-primary);
    }
    .row__img {
      width: 56px;
    }
    .row__main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .row__title {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--spacing-2);
    }
    .row__card {
      overflow: hidden;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row__code {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .row__who {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .row__terms {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .row__kind {
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .row__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      text-align: right;
    }
    .row__turn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--color-primary);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .row__turn mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .row__muted {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    @media (max-width: 599px) {
      .row {
        grid-template-columns: 44px minmax(0, 1fr);
        gap: var(--spacing-3);
      }
      .row__img {
        width: 44px;
      }
      .row__side {
        grid-column: 2;
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-start;
        gap: var(--spacing-2);
        text-align: left;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferSummaryRowComponent {
  readonly offer = input.required<OfferSummary>();

  protected readonly image = computed(() => {
    const item = this.offer().item;
    return item ? (item.images[0]?.url ?? printingImageUrl(item.printing)) : null;
  });
  protected readonly code = computed(() => printingCode(this.offer().item?.printing));
  protected readonly status = computed(() => offerStatusInfo(this.offer().status));
  protected readonly live = computed(() => isLiveOffer(this.offer().status));
  protected readonly kind = computed(() => offerKindLabel(this.offer().kind));
  protected readonly expiry = computed(() => expiryLabel(this.offer().expiresAt));
  protected readonly terms = computed(() => {
    const offer = this.offer();
    return offerTermsText({
      kind: offer.kind,
      cashAmount: offer.cashAmount,
      currency: offer.currency,
      cards: offer.tradeItemCount,
    });
  });
  protected readonly label = computed(() => {
    const offer = this.offer();
    const card = offer.item?.card.name ?? 'a card';
    const direction = offer.viewerRole === 'SELLER' ? 'from' : 'to';
    return (
      `Offer on ${card} ${direction} ${offer.counterparty.displayName}: ${this.terms()}, ` +
      `${this.status().label}${offer.yourTurn ? ', your turn' : ''}`
    );
  });
}
