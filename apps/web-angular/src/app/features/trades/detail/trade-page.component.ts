import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import type { PublicInventoryItem, RatingEligibilityInteraction } from '@orenji/api-client';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { ConversationStarterService } from '../../../shared/messaging/conversation-starter.service';
import { DealSummaryComponent } from '../../../shared/offers/deal-summary.component';
import { OfferActionsService } from '../../../shared/offers/offer-actions.service';
import { offerKindLabel } from '../../../shared/offers/offer-labels';
import { OfferPartyCardComponent } from '../../../shared/offers/offer-party-card.component';
import { StatusChipComponent } from '../../../shared/offers/status-chip.component';
import { nextActionView, tradeStatusInfo } from '../../../shared/offers/trade-labels';
import { RatingActionsService } from '../../../shared/ratings/rating-actions.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { formatDateTime, money } from '../../../shared/payments/payment-labels';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { TradeDetailStore } from '../data/trade-detail.store';
import { TradeProtectionActions } from '../data/trade-protection.actions';
import { TradeDisputeCardComponent } from './trade-dispute-card.component';
import { TradeNextActionComponent } from './trade-next-action.component';
import { TradePaymentCardComponent } from './trade-payment-card.component';
import { TradePayoutSetupComponent } from './trade-payout-setup.component';
import { TradeShipmentCardComponent } from './trade-shipment-card.component';
import { TradeStepsComponent } from './trade-steps.component';
import { TradeTimelineComponent } from './trade-timeline.component';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';

/** A card the viewer received in a completed trade (to add to their inventory). */
interface ReceivedCard {
  key: string;
  name: string;
  game: string;
  imageUrl: string | null;
  printingId: string | null;
  cardId: string;
  quantity: number;
}

/**
 * `/trades/:id`: a trade for its two parties (anybody else gets the not-found state): the
 * next-action banner, progress (meetup marks and confirmations of both parties, or the payment
 * protection steps), the deal, the other collector, the protected payment, shipment and dispute,
 * and the timeline. Operations come from `allowedOperations`: mark the in-person meetup, confirm
 * the exchange, cancel with a required reason, and with payment protection pay (fake checkout
 * locally), ship, confirm receipt and open a dispute. A seller waiting for a payment is reminded
 * to set up payouts. Once completed it offers to rate the other collector and to add the received
 * cards to the inventory (the API only removes the given cards). `?payment=secured|failed` is the
 * checkout page's answer.
 */
@Component({
  selector: 'app-trade-page',
  imports: [
    CardImageComponent,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    DealSummaryComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    OfferPartyCardComponent,
    SkeletonComponent,
    StatusChipComponent,
    TradeDisputeCardComponent,
    TradeNextActionComponent,
    TradePaymentCardComponent,
    TradePayoutSetupComponent,
    TradeShipmentCardComponent,
    TradeStepsComponent,
    TradeTimelineComponent,
  ],
  providers: [TradeDetailStore, TradeProtectionActions],
  template: `
    <div class="page tp">
      @switch (store.status()) {
        @case ('loading') {
          <div class="tp__skeleton" aria-busy="true">
            <span class="visually-hidden">Loading the trade</span>
            <app-skeleton height="72px" />
            <app-skeleton height="120px" />
            <app-skeleton height="240px" />
          </div>
        }
        @case ('not-found') {
          <app-empty-state
            icon="handshake"
            title="This trade is not available"
            description="It does not exist, or you are not one of its two collectors."
          >
            <a actions matButton="filled" routerLink="/trades">My trades</a>
          </app-empty-state>
        }
        @case ('error') {
          <app-error-state
            title="This trade could not load"
            [message]="errorMessage()"
            [requestId]="store.error()?.requestId ?? null"
            (retry)="store.retry()"
          />
        }
        @case ('ready') {
          @if (store.trade(); as trade) {
            <a class="tp__back" routerLink="/trades">
              <mat-icon aria-hidden="true">arrow_back</mat-icon>
              My trades
            </a>
            <header class="tp__head">
              <p class="tp__eyebrow">Trade with {{ trade.counterparty.displayName }}</p>
              <h1 class="tp__title">{{ trade.offer.item?.card?.name ?? 'Trade' }}</h1>
              <div class="tp__chips">
                <app-status-chip
                  [label]="status().label"
                  [icon]="status().icon"
                  [tone]="status().tone"
                />
                <span class="tp__pill">{{ kindLabel() }}</span>
                @if (trade.meetup) {
                  <span class="tp__pill">
                    <mat-icon aria-hidden="true">groups</mat-icon>
                    In-person meetup
                  </span>
                }
                @if (trade.protectionEnabled && !trade.meetup) {
                  <span class="tp__pill tp__pill--protected">
                    <mat-icon aria-hidden="true">verified_user</mat-icon>
                    Payment protection
                  </span>
                }
              </div>
            </header>

            @if (store.notice(); as notice) {
              <div
                class="tp__notice"
                [attr.data-tone]="notice.tone"
                [attr.role]="notice.tone === 'warning' ? 'alert' : 'status'"
                data-testid="trade-notice"
              >
                <mat-icon aria-hidden="true">{{
                  notice.tone === 'success' ? 'check_circle' : 'error'
                }}</mat-icon>
                <span>{{ notice.message }}</span>
                <button
                  matIconButton
                  type="button"
                  aria-label="Dismiss the message"
                  (click)="store.dismissNotice()"
                >
                  <mat-icon>close</mat-icon>
                </button>
              </div>
            }

            @if (
              trade.protectionEnabled &&
              trade.viewerRole === 'SELLER' &&
              trade.status === 'AWAITING_PAYMENT'
            ) {
              <app-trade-payout-setup
                [tradeId]="trade.id"
                [buyerName]="trade.counterparty.displayName"
              />
            }

            <app-trade-next-action [view]="nextAction()">
              @if (store.allowed().has('PAY')) {
                <button
                  actions
                  matButton="filled"
                  type="button"
                  [disabled]="!!store.busy()"
                  (click)="protection.pay()"
                >
                  <mat-icon aria-hidden="true">lock</mat-icon>
                  {{ store.busy() === 'PAY' ? 'Opening the checkout…' : 'Pay ' + amount() }}
                </button>
              }
              @if (store.allowed().has('SHIP')) {
                <button
                  actions
                  matButton="filled"
                  type="button"
                  [disabled]="!!store.busy()"
                  (click)="protection.ship()"
                >
                  <mat-icon aria-hidden="true">local_shipping</mat-icon>
                  {{ store.busy() === 'SHIP' ? 'Saving…' : 'Mark as shipped' }}
                </button>
              }
              @if (store.allowed().has('CONFIRM_RECEIPT')) {
                <button
                  actions
                  matButton="filled"
                  type="button"
                  [disabled]="!!store.busy()"
                  (click)="protection.confirmReceipt()"
                >
                  <mat-icon aria-hidden="true">inventory</mat-icon>
                  {{ store.busy() === 'CONFIRM_RECEIPT' ? 'Confirming…' : 'Confirm receipt' }}
                </button>
              }
              @if (store.allowed().has('OPEN_DISPUTE')) {
                <button
                  actions
                  matButton="outlined"
                  type="button"
                  [disabled]="!!store.busy()"
                  (click)="protection.openDispute()"
                >
                  <mat-icon aria-hidden="true">report</mat-icon>
                  {{ store.busy() === 'OPEN_DISPUTE' ? 'Opening…' : 'Open a dispute' }}
                </button>
              }
              @if (trade.dispute; as dispute) {
                <a actions matButton="tonal" [routerLink]="['/disputes', dispute.id]">
                  <mat-icon aria-hidden="true">gavel</mat-icon>
                  View the dispute
                </a>
              }
              @if (store.allowed().has('CONFIRM_COMPLETION')) {
                <button
                  actions
                  matButton="filled"
                  type="button"
                  [disabled]="!!store.busy()"
                  (click)="confirmCompletion()"
                >
                  <mat-icon aria-hidden="true">task_alt</mat-icon>
                  {{
                    store.busy() === 'CONFIRM_COMPLETION' ? 'Confirming…' : 'Confirm the exchange'
                  }}
                </button>
              }
              @if (store.allowed().has('MARK_MEETUP')) {
                <button
                  actions
                  matButton="outlined"
                  type="button"
                  [disabled]="!!store.busy()"
                  (click)="markMeetup()"
                >
                  <mat-icon aria-hidden="true">groups</mat-icon>
                  {{
                    store.busy() === 'MARK_MEETUP'
                      ? 'Saving…'
                      : trade.protectionEnabled
                        ? 'Meet in person instead'
                        : 'We meet in person'
                  }}
                </button>
              }
              @if (rateable().length > 0) {
                <button actions matButton="filled" type="button" (click)="rate()">
                  <mat-icon aria-hidden="true">star</mat-icon>
                  Rate {{ trade.counterparty.displayName }}
                </button>
              }
              <button actions matButton type="button" [disabled]="messaging()" (click)="message()">
                <mat-icon aria-hidden="true">chat</mat-icon>
                {{ messaging() ? 'Opening…' : 'Message ' + trade.counterparty.displayName }}
              </button>
            </app-trade-next-action>

            <div class="tp__grid">
              <div class="tp__main">
                <section aria-labelledby="tp-progress">
                  <h2 id="tp-progress" class="tp__h2">Progress</h2>
                  <app-trade-steps [trade]="trade" />
                </section>

                @if (received().length > 0) {
                  <section class="tp__received" aria-labelledby="tp-received">
                    <h2 id="tp-received" class="tp__h2">Cards you received</h2>
                    <p class="tp__muted">
                      Your inventory is not changed for you: add what you received so collectors
                      nearby can find it.
                    </p>
                    <ul class="tp__received-list">
                      @for (card of received(); track card.key) {
                        <li>
                          <span class="tp__received-card">
                            <app-card-image
                              size="xs"
                              [src]="card.imageUrl"
                              [alt]="card.name"
                              [game]="card.game"
                            />
                            <span class="tp__received-name">
                              {{ card.name }}
                              @if (card.quantity > 1) {
                                ×{{ card.quantity }}
                              }
                            </span>
                          </span>
                          <a
                            matButton="tonal"
                            routerLink="/inventory"
                            [queryParams]="{ add: card.printingId, card: card.cardId }"
                          >
                            <mat-icon aria-hidden="true">library_add</mat-icon>
                            Add to my inventory
                          </a>
                        </li>
                      }
                    </ul>
                  </section>
                }

                <section aria-labelledby="tp-deal">
                  <h2 id="tp-deal" class="tp__h2">The deal</h2>
                  <app-deal-summary
                    [item]="trade.offer.item"
                    [kind]="trade.kind"
                    [cashAmount]="trade.cashAmount"
                    [currency]="trade.currency"
                    [tradeItems]="trade.offer.tradeItems"
                    [sellerName]="
                      trade.viewerRole === 'SELLER' ? 'You' : trade.offer.seller.displayName
                    "
                    [buyerName]="
                      trade.viewerRole === 'BUYER' ? 'You' : trade.offer.buyer.displayName
                    "
                  />
                  <a class="tp__offer-link" [routerLink]="['/offers', trade.offer.id]">
                    <mat-icon aria-hidden="true">history</mat-icon>
                    See the offer and its negotiation
                  </a>
                </section>
              </div>
              <aside class="tp__side">
                @if (trade.dispute; as dispute) {
                  <app-trade-dispute-card [dispute]="dispute" [currency]="trade.currency" />
                }
                @if (trade.payment; as payment) {
                  <app-trade-payment-card [payment]="payment" [viewerRole]="trade.viewerRole" />
                }
                @if (trade.shipment; as shipment) {
                  <app-trade-shipment-card [shipment]="shipment" />
                }
                <section aria-labelledby="tp-with">
                  <h2 id="tp-with" class="tp__h2">Trading with</h2>
                  <app-offer-party-card
                    [role]="trade.viewerRole === 'SELLER' ? 'Buyer' : 'Seller'"
                    [party]="trade.counterparty"
                  />
                  <p class="tp__safety">
                    <mat-icon aria-hidden="true">shield_person</mat-icon>
                    @if (trade.protectionEnabled && !trade.meetup) {
                      Ship with tracking and keep photos of the card; check it before you confirm
                      receipt.
                    } @else {
                      Meet in a busy public place and check the card before you confirm.
                    }
                  </p>
                </section>
                <section aria-labelledby="tp-timeline">
                  <h2 id="tp-timeline" class="tp__h2">Timeline</h2>
                  <app-trade-timeline
                    [timeline]="trade.timeline"
                    [viewerRole]="trade.viewerRole"
                    [sellerName]="trade.offer.seller.displayName"
                    [buyerName]="trade.offer.buyer.displayName"
                  />
                </section>
                @if (store.allowed().has('CANCEL')) {
                  <button
                    matButton
                    type="button"
                    class="tp__cancel"
                    [disabled]="!!store.busy()"
                    (click)="cancel()"
                  >
                    <mat-icon aria-hidden="true">cancel</mat-icon>
                    {{ store.busy() === 'CANCEL' ? 'Cancelling…' : 'Cancel trade' }}
                  </button>
                }
              </aside>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .tp {
      max-width: 1180px;
    }
    .tp__skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .tp__back {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .tp__back:hover {
      color: var(--color-ink);
    }
    .tp__back mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .tp__head {
      margin-bottom: var(--spacing-5);
    }
    .tp__eyebrow {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .tp__title {
      margin: 2px 0 var(--spacing-2);
      font-size: var(--font-size-3xl);
    }
    .tp__chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
    .tp__pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .tp__pill mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .tp__pill--protected {
      background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
      color: var(--color-ink);
    }
    .tp__pill--protected mat-icon {
      color: var(--color-success);
    }
    .tp__notice {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-4);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-info) 12%, var(--color-surface));
    }
    .tp__notice > span {
      flex: 1 1 auto;
    }
    .tp__notice[data-tone='success'] {
      background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
    }
    .tp__notice[data-tone='warning'] {
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
    }
    .tp__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
      align-items: start;
      gap: var(--spacing-6);
      margin-top: var(--spacing-6);
    }
    .tp__main,
    .tp__side {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-6);
      min-width: 0;
    }
    .tp__h2 {
      margin: 0 0 var(--spacing-3);
      font-size: var(--font-size-lg);
    }
    .tp__muted {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .tp__received {
      padding: var(--spacing-4);
      border-radius: var(--radius-lg);
      background: var(--color-accent-container);
      color: var(--color-on-accent-container);
    }
    .tp__received .tp__muted {
      color: inherit;
    }
    .tp__received-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tp__received-list li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-2);
    }
    .tp__received-card {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
    }
    .tp__received-name {
      font-weight: var(--font-weight-semibold);
    }
    .tp__offer-link {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      margin-top: var(--spacing-3);
      font-size: var(--font-size-sm);
    }
    .tp__offer-link mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .tp__safety {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .tp__safety mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .tp__cancel {
      align-self: flex-start;
      --mat-button-text-label-text-color: var(--color-danger);
    }
    @media (max-width: 959px) {
      .tp__grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradePageComponent {
  protected readonly store = inject(TradeDetailStore);
  protected readonly protection = inject(TradeProtectionActions);
  private readonly offers = inject(OfferActionsService);
  private readonly ratings = inject(RatingActionsService);
  private readonly conversations = inject(ConversationStarterService);
  private readonly router = inject(Router);

  /** Route parameter (bound by the router). */
  readonly id = input.required<string>();
  /** `?payment=secured|failed`: where the checkout page sent the buyer back from. */
  readonly payment = input<string | undefined>();

  protected readonly status = computed(() => tradeStatusInfo(this.store.trade()?.status));
  protected readonly kindLabel = computed(() => offerKindLabel(this.store.trade()?.kind));
  /** What the buyer pays (the cash part of the deal). */
  protected readonly amount = computed(() => {
    const trade = this.store.trade();
    return money(trade?.payment?.amount ?? trade?.cashAmount, trade?.currency);
  });
  protected readonly nextAction = computed(() => {
    const trade = this.store.trade();
    return nextActionView(
      trade
        ? {
            status: trade.status,
            nextAction: trade.nextAction,
            viewerRole: trade.viewerRole,
            other: trade.counterparty.displayName,
            cancelReason: trade.cancelReason,
            protectionEnabled: trade.protectionEnabled && !trade.meetup,
            paymentStatus: trade.payment?.status ?? null,
            windowEndsAt: trade.payment?.disputeWindowEndsAt
              ? formatDateTime(trade.payment.disputeWindowEndsAt)
              : null,
          }
        : { status: 'AGREED', nextAction: { action: 'NONE' }, viewerRole: 'BUYER', other: '' },
    );
  });
  /** Completed trades with the other collector still to rate (after completion). */
  protected readonly rateable = signal<RatingEligibilityInteraction[]>([]);
  protected readonly received = computed<ReceivedCard[]>(() => {
    const trade = this.store.trade();
    if (!trade || trade.status !== 'COMPLETED') {
      return [];
    }
    const cards: { item: PublicInventoryItem | undefined; quantity: number }[] =
      trade.viewerRole === 'BUYER'
        ? [{ item: trade.offer.item, quantity: 1 }]
        : trade.offer.tradeItems.map((line) => ({ item: line.item, quantity: line.quantity }));
    return cards
      .filter((card): card is { item: PublicInventoryItem; quantity: number } => !!card.item)
      .map((card, index) => ({
        key: `${card.item.id}-${index}`,
        name: card.item.card.name,
        game: card.item.card.game,
        imageUrl: printingImageUrl(card.item.printing),
        printingId: card.item.printing.id ?? null,
        cardId: card.item.card.id,
        quantity: card.quantity,
      }));
  });
  protected readonly messaging = computed(() => {
    const trade = this.store.trade();
    return !!trade && this.conversations.starting() === trade.counterparty.id;
  });
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  private eligibilityChecked: string | null = null;
  private checkoutNoticeShown = false;

  constructor() {
    this.store.init();
    effect(() => {
      const id = this.id();
      untracked(() => this.store.load(id));
    });
    // Back from the checkout page: say how the payment went, once.
    effect(() => {
      const trade = this.store.trade();
      const outcome = this.payment();
      if (!trade || !outcome || this.checkoutNoticeShown) {
        return;
      }
      this.checkoutNoticeShown = true;
      untracked(() =>
        this.store.showNotice(
          outcome === 'failed'
            ? {
                tone: 'warning',
                message: 'The payment did not go through. Nothing was charged: you can try again.',
              }
            : {
                tone: 'success',
                message: `Payment secured. The payment provider holds it until you confirm receipt; ${trade.counterparty.displayName} was asked to ship.`,
              },
        ),
      );
    });
    // Once the trade is completed, ask whether the other collector can still be rated.
    effect(() => {
      const trade = this.store.trade();
      if (trade?.status === 'COMPLETED' && this.eligibilityChecked !== trade.id) {
        this.eligibilityChecked = trade.id;
        untracked(() => void this.checkEligibility(trade.counterparty.id));
      }
    });
  }

  protected async markMeetup(): Promise<void> {
    await this.store.markMeetup();
  }

  protected async confirmCompletion(): Promise<void> {
    const trade = this.store.trade();
    if (!trade) {
      return;
    }
    const confirmed = await this.offers.confirm({
      title: 'Confirm the exchange?',
      message:
        'Confirm only once you exchanged the cards. When both of you confirmed, the trade is ' +
        'completed and the cards leave your inventories.',
      confirmLabel: 'Confirm the exchange',
    });
    if (confirmed) {
      await this.store.confirmCompletion();
    }
  }

  protected async cancel(): Promise<void> {
    const reason = await this.offers.tradeCancelReason(this.store.otherName());
    if (reason) {
      await this.store.cancel(reason);
    }
  }

  protected async rate(): Promise<void> {
    const trade = this.store.trade();
    if (!trade) {
      return;
    }
    const party = trade.counterparty;
    const rating = await this.ratings.rate(
      {
        id: party.id,
        displayName: party.displayName,
        handle: party.handle,
        avatarUrl: party.avatarUrl,
      },
      this.rateable(),
    );
    if (rating) {
      await this.checkEligibility(party.id);
    }
  }

  protected async message(): Promise<void> {
    const trade = this.store.trade();
    if (!trade) {
      return;
    }
    const conversation = await this.conversations.start(trade.counterparty.id);
    if (conversation) {
      await this.router.navigate(['/messages', conversation.id]);
    }
  }

  private async checkEligibility(userId: string): Promise<void> {
    try {
      const eligibility = await this.ratings.eligibility(userId);
      // The trade page rates the completed trade (the accepted offer can be rated on the profile).
      this.rateable.set(
        eligibility.interactions.filter(
          (interaction) => !interaction.alreadyRated && interaction.kind === 'TRADE',
        ),
      );
    } catch {
      this.rateable.set([]);
    }
  }
}
