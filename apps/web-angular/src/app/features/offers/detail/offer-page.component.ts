import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { ConversationStarterService } from '../../../shared/messaging/conversation-starter.service';
import { DealSummaryComponent } from '../../../shared/offers/deal-summary.component';
import { OfferActionsService } from '../../../shared/offers/offer-actions.service';
import {
  expiryLabel,
  isLiveOffer,
  offerKindLabel,
  offerStatusInfo,
} from '../../../shared/offers/offer-labels';
import { OfferPartyCardComponent } from '../../../shared/offers/offer-party-card.component';
import { offerTargetFromItem, sellerFromParty } from '../../../shared/offers/offer-target';
import { StatusChipComponent } from '../../../shared/offers/status-chip.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { OfferDetailStore } from '../data/offer-detail.store';
import { OfferActionBarComponent } from './offer-action-bar.component';
import { OfferHistoryComponent } from './offer-history.component';

/**
 * `/offers/:id`: one proposal for its two parties (anybody else gets the not-found state, as the
 * API answers 404): the card, the deal, both parties (region label and distance bucket only), the
 * history of the whole negotiation and the answers the viewer may give now. Accepting opens the
 * trade; countering moves to the new proposal; stale answers reload onto the live proposal.
 */
@Component({
  selector: 'app-offer-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    DealSummaryComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    OfferActionBarComponent,
    OfferHistoryComponent,
    OfferPartyCardComponent,
    SkeletonComponent,
    StatusChipComponent,
  ],
  providers: [OfferDetailStore],
  template: `
    <div class="page op">
      @switch (store.status()) {
        @case ('loading') {
          <div class="op__skeleton" aria-busy="true">
            <span class="visually-hidden">Loading the offer</span>
            <app-skeleton height="72px" />
            <app-skeleton height="240px" />
            <app-skeleton variant="list" lines="3" />
          </div>
        }
        @case ('not-found') {
          <app-empty-state
            icon="local_offer"
            title="This offer is not available"
            description="It does not exist, or you are not one of the two collectors of this negotiation."
          >
            <a actions matButton="filled" routerLink="/offers">My offers</a>
          </app-empty-state>
        }
        @case ('error') {
          <app-error-state
            title="This offer could not load"
            [message]="errorMessage()"
            [requestId]="store.error()?.requestId ?? null"
            (retry)="store.retry()"
          />
        }
        @case ('ready') {
          @if (store.offer(); as offer) {
            <a
              class="op__back"
              routerLink="/offers"
              [queryParams]="{ tab: offer.viewerRole === 'BUYER' ? 'sent' : null }"
            >
              <mat-icon aria-hidden="true">arrow_back</mat-icon>
              My offers
            </a>

            <header class="op__head">
              <p class="op__eyebrow">
                {{ offer.viewerRole === 'SELLER' ? 'Offer from' : 'Your offer to' }}
                {{ store.otherName() }}
              </p>
              <h1 class="op__title">{{ offer.item?.card?.name ?? 'Offer' }}</h1>
              <div class="op__chips" data-testid="offer-chips">
                <app-status-chip
                  [label]="status().label"
                  [icon]="status().icon"
                  [tone]="status().tone"
                />
                <span class="op__pill">{{ kindLabel() }}</span>
                @if (round() > 1) {
                  <span class="op__pill">Round {{ round() }}</span>
                }
                @if (live() && expiry(); as expiry) {
                  <span class="op__pill op__pill--time">
                    <mat-icon aria-hidden="true">schedule</mat-icon>
                    {{ expiry }}
                  </span>
                }
              </div>
            </header>

            @if (store.notice(); as notice) {
              <div
                class="op__notice"
                [attr.data-tone]="notice.tone"
                [attr.role]="notice.tone === 'warning' ? 'alert' : 'status'"
                data-testid="offer-notice"
              >
                <mat-icon aria-hidden="true">{{
                  notice.tone === 'success'
                    ? 'check_circle'
                    : notice.tone === 'warning'
                      ? 'error'
                      : 'info'
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

            @if (offer.superseded && offer.latestOfferId !== offer.id) {
              <div class="op__banner" role="status">
                <mat-icon aria-hidden="true">update</mat-icon>
                <span>A newer proposal replaced this one.</span>
                <a matButton="filled" [routerLink]="['/offers', offer.latestOfferId]"
                  >See the latest proposal</a
                >
              </div>
            }
            @if (offer.tradeId) {
              <div class="op__banner op__banner--success" role="status">
                <mat-icon aria-hidden="true">handshake</mat-icon>
                <span>Offer accepted: the trade is open.</span>
                <a matButton="filled" [routerLink]="['/trades', offer.tradeId]">Go to the trade</a>
              </div>
            }

            <div class="op__grid">
              <div class="op__main">
                @if (!offer.superseded) {
                  <app-offer-action-bar
                    [allowedActions]="offer.allowedActions"
                    [busy]="store.busy()"
                    [yourTurn]="store.yourTurn()"
                    [waiting]="store.waiting()"
                    [otherName]="store.otherName()"
                    [messaging]="messaging()"
                    (acceptRequested)="accept()"
                    (counterRequested)="counter()"
                    (declineRequested)="decline()"
                    (withdrawRequested)="cancel()"
                    (messageRequested)="message()"
                  />
                }
                <section class="op__section" aria-labelledby="op-deal">
                  <h2 id="op-deal" class="op__h2">The deal</h2>
                  <app-deal-summary
                    [item]="offer.item"
                    [kind]="offer.kind"
                    [cashAmount]="offer.cashAmount"
                    [currency]="offer.currency"
                    [tradeItems]="offer.tradeItems"
                    [message]="offer.message"
                    [messageAuthor]="author()"
                    [sellerName]="sellerName()"
                    [buyerName]="buyerName()"
                  />
                </section>
              </div>
              <aside class="op__side">
                <section class="op__section" aria-labelledby="op-parties">
                  <h2 id="op-parties" class="op__h2">Collectors</h2>
                  <div class="op__parties">
                    <app-offer-party-card
                      role="Seller"
                      [party]="offer.seller"
                      [isYou]="offer.viewerRole === 'SELLER'"
                    />
                    <app-offer-party-card
                      role="Buyer"
                      [party]="offer.buyer"
                      [isYou]="offer.viewerRole === 'BUYER'"
                    />
                  </div>
                  <p class="op__privacy">
                    <mat-icon aria-hidden="true">shield_person</mat-icon>
                    Only approximate areas are shared. Meet in a public place.
                  </p>
                </section>
                <section class="op__section" aria-labelledby="op-history">
                  <h2 id="op-history" class="op__h2">History</h2>
                  <app-offer-history
                    [history]="offer.history"
                    [viewerRole]="offer.viewerRole"
                    [sellerName]="offer.seller.displayName"
                    [buyerName]="offer.buyer.displayName"
                  />
                </section>
              </aside>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .op {
      max-width: 1180px;
    }
    .op__skeleton {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
    }
    .op__back {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      margin-bottom: var(--spacing-3);
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-decoration: none;
    }
    .op__back:hover {
      color: var(--color-ink);
    }
    .op__back mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .op__head {
      margin-bottom: var(--spacing-5);
    }
    .op__eyebrow {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .op__title {
      margin: 2px 0 var(--spacing-2);
      font-size: var(--font-size-3xl);
    }
    .op__chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
    .op__pill {
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
    .op__pill mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .op__notice,
    .op__banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2) var(--spacing-3);
      margin-bottom: var(--spacing-4);
      padding: var(--spacing-2) var(--spacing-2) var(--spacing-2) var(--spacing-4);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-info) 12%, var(--color-surface));
      animation: op-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .op__notice > span,
    .op__banner > span {
      flex: 1 1 240px;
    }
    .op__notice[data-tone='success'],
    .op__banner--success {
      background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
    }
    .op__notice[data-tone='warning'] {
      background: color-mix(in srgb, var(--color-warning) 16%, var(--color-surface));
    }
    .op__banner {
      padding-right: var(--spacing-3);
    }
    .op__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
      align-items: start;
      gap: var(--spacing-6);
    }
    .op__main,
    .op__side {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-5);
      min-width: 0;
    }
    .op__h2 {
      margin: 0 0 var(--spacing-3);
      font-size: var(--font-size-lg);
    }
    .op__parties {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
    }
    .op__privacy {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: var(--spacing-2) 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .op__privacy mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    @keyframes op-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .op__notice,
      .op__banner {
        animation: none;
      }
    }
    @media (max-width: 959px) {
      .op__grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferPageComponent {
  protected readonly store = inject(OfferDetailStore);
  private readonly offers = inject(OfferActionsService);
  private readonly conversations = inject(ConversationStarterService);
  private readonly router = inject(Router);

  /** Route parameter (bound by the router). */
  readonly id = input.required<string>();

  protected readonly status = computed(() => offerStatusInfo(this.store.offer()?.status));
  protected readonly live = computed(() => isLiveOffer(this.store.offer()?.status));
  protected readonly kindLabel = computed(() => offerKindLabel(this.store.offer()?.kind));
  protected readonly expiry = computed(() => expiryLabel(this.store.offer()?.expiresAt));
  protected readonly round = computed(
    () =>
      (this.store.offer()?.history ?? []).filter(
        (event) => event.event === 'CREATED' || event.event === 'COUNTERED',
      ).length,
  );
  protected readonly sellerName = computed(() => this.nameOf('SELLER'));
  protected readonly buyerName = computed(() => this.nameOf('BUYER'));
  /** Who wrote the note of this proposal: the party who made it (the other one's turn now). */
  protected readonly author = computed(() => {
    const offer = this.store.offer();
    if (!offer) {
      return null;
    }
    const proposer = offer.currentTurn === 'SELLER' ? 'BUYER' : 'SELLER';
    return this.nameOf(proposer);
  });
  protected readonly messaging = computed(() => {
    const other = this.store.other();
    return !!other && this.conversations.starting() === other.id;
  });
  protected readonly errorMessage = computed(() => {
    const error = this.store.error();
    return error ? friendlyMessage(error) : '';
  });

  constructor() {
    this.store.init();
    effect(() => {
      const id = this.id();
      untracked(() => this.store.load(id));
    });
  }

  protected async accept(): Promise<void> {
    const offer = this.store.offer();
    if (!offer || !(await this.offers.confirmAccept(offer, this.store.otherName()))) {
      return;
    }
    await this.store.accept();
  }

  protected async counter(): Promise<void> {
    const offer = this.store.offer();
    if (!offer) {
      return;
    }
    if (!offer.item) {
      await this.store.countered({
        problem: {
          code: 'ITEM_UNAVAILABLE',
          message: 'This card is no longer available, so the offer cannot be countered.',
          openOfferId: null,
          latestOfferId: null,
          reload: true,
          fields: {},
        },
      });
      return;
    }
    this.store.markBusy('COUNTER');
    try {
      const result = await this.offers.counter(
        offer,
        offerTargetFromItem(offer.item, sellerFromParty(offer.seller)),
        offer.viewerRole,
        this.store.otherName(),
      );
      if (result) {
        await this.store.countered(result);
      }
    } finally {
      this.store.markBusy(null);
    }
  }

  protected async decline(): Promise<void> {
    const reason = await this.offers.declineReason(this.store.otherName());
    if (reason !== null) {
      await this.store.decline(reason);
    }
  }

  protected async cancel(): Promise<void> {
    const reason = await this.offers.withdrawReason(this.store.otherName());
    if (reason !== null) {
      await this.store.cancel(reason);
    }
  }

  protected async message(): Promise<void> {
    const other = this.store.other();
    if (!other) {
      return;
    }
    const conversation = await this.conversations.start(other.id);
    if (conversation) {
      await this.router.navigate(['/messages', conversation.id]);
    }
  }

  private nameOf(role: 'SELLER' | 'BUYER'): string {
    const offer = this.store.offer();
    if (!offer) {
      return '';
    }
    if (offer.viewerRole === role) {
      return 'You';
    }
    return role === 'SELLER' ? offer.seller.displayName : offer.buyer.displayName;
  }
}
