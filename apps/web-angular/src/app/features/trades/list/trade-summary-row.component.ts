import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { TradeSummary } from '@orenji/api-client';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { offerTermsText } from '../../../shared/offers/offer-labels';
import { StatusChipComponent } from '../../../shared/offers/status-chip.component';
import { nextActionShort, tradeStatusInfo } from '../../../shared/offers/trade-labels';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { AvatarComponent } from '../../../shared/ui/avatar/avatar.component';

/** One trade of the list: the card, the other collector, the terms, status and next step. */
@Component({
  selector: 'app-trade-summary-row',
  imports: [
    RouterLink,
    MatIconModule,
    AvatarComponent,
    CardImageComponent,
    RelativeTimePipe,
    StatusChipComponent,
  ],
  template: `
    @let t = trade();
    <a
      class="row"
      [class.row--turn]="yourMove()"
      [routerLink]="['/trades', t.id]"
      [attr.aria-label]="label()"
      data-testid="trade-row"
    >
      <app-card-image class="row__img" [src]="image()" [game]="t.item?.card?.game ?? ''" alt="" />
      <span class="row__main">
        <span class="row__card">
          {{ t.item?.card?.name ?? 'Card no longer available' }}
          @if (code()) {
            <span class="row__code mono">{{ code() }}</span>
          }
        </span>
        <span class="row__who">
          <app-avatar
            size="xs"
            [src]="t.counterparty.avatarUrl"
            [name]="t.counterparty.displayName"
            [decorative]="true"
          />
          {{ t.viewerRole === 'SELLER' ? 'With buyer' : 'With seller' }}
          {{ t.counterparty.displayName }}
        </span>
        <span class="row__terms"
          ><strong>{{ terms() }}</strong>
          @if (t.meetup) {
            <span class="row__muted">· In-person meetup</span>
          } @else if (t.protectionEnabled) {
            <span class="row__muted">· Payment protection</span>
          }
        </span>
      </span>
      <span class="row__side">
        <app-status-chip [label]="status().label" [icon]="status().icon" [tone]="status().tone" />
        <span class="row__next" [class.row__next--mine]="yourMove()">{{ next() }}</span>
        <span class="row__muted">{{ t.updatedAt | relativeTime }}</span>
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
    .row__card {
      overflow: hidden;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row__code {
      margin-left: var(--spacing-2);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-regular);
    }
    .row__who,
    .row__terms {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      font-size: var(--font-size-sm);
    }
    .row__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      text-align: right;
    }
    .row__next {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .row__next--mine {
      color: var(--color-primary);
      font-weight: var(--font-weight-semibold);
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
export class TradeSummaryRowComponent {
  readonly trade = input.required<TradeSummary>();

  protected readonly image = computed(() => {
    const item = this.trade().item;
    return item ? (item.images[0]?.url ?? printingImageUrl(item.printing)) : null;
  });
  protected readonly code = computed(() => printingCode(this.trade().item?.printing));
  protected readonly status = computed(() => tradeStatusInfo(this.trade().status));
  protected readonly yourMove = computed(() => {
    const trade = this.trade();
    return (
      trade.nextAction.action !== 'NONE' &&
      (trade.nextAction.actor as string | null | undefined) === trade.viewerRole
    );
  });
  protected readonly next = computed(() => {
    const trade = this.trade();
    return nextActionShort(
      trade.status,
      trade.nextAction,
      trade.viewerRole,
      trade.counterparty.displayName,
    );
  });
  protected readonly terms = computed(() => {
    const trade = this.trade();
    return offerTermsText({
      kind: trade.kind,
      cashAmount: trade.cashAmount,
      currency: trade.currency,
      cards: trade.tradeItemCount,
    });
  });
  protected readonly label = computed(() => {
    const trade = this.trade();
    return (
      `Trade of ${trade.item?.card.name ?? 'a card'} with ${trade.counterparty.displayName}: ` +
      `${this.terms()}, ${this.status().label}, ${this.next()}`
    );
  });
}
