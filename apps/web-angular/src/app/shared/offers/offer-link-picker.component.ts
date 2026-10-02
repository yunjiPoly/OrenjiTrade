import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { OfferSummary, OffersService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { silentErrors } from '../../core/http/http-context';
import { printingImageUrl } from '../inventory/inventory-labels';
import { offerStatusInfo, offerTermsText } from './offer-labels';
import { StatusChipComponent } from './status-chip.component';
import { CardImageComponent } from '../ui/card-image/card-image.component';

/** An offer the caller may link in a conversation (`OFFER_LINK` message). */
export interface OfferLinkChoice {
  offerId: string;
  cardName: string;
  /** Picture of the offer's card (API URL), `null` when unknown. */
  imageUrl: string | null;
  game: string | null;
  terms: string;
  status: string;
}

/** How many recent negotiations are searched for the conversation partner. */
const RECENT_OFFERS = 50;

type LoadState = 'loading' | 'ready' | 'error';

/** The negotiations with `otherId` among the caller's recent offers, as link choices. */
export function offerChoices(offers: readonly OfferSummary[], otherId: string): OfferLinkChoice[] {
  return offers
    .filter((offer) => offer.counterparty.id === otherId)
    .map((offer) => ({
      offerId: offer.id,
      cardName: offer.item?.card.name ?? 'A card',
      imageUrl: printingImageUrl(offer.item?.printing),
      game: offer.item?.card.game ?? null,
      terms: offerTermsText({
        kind: offer.kind,
        cashAmount: offer.cashAmount,
        currency: offer.currency,
        cards: offer.tradeItemCount,
      }),
      status: offer.status,
    }));
}

/**
 * "Share an offer" in the message composer: the caller's recent negotiations with the other
 * participant (`GET /offers`, both sides; the API only links offers between the two), picked from
 * a keyboard-friendly list. Escape cancels.
 */
@Component({
  selector: 'app-offer-link-picker',
  imports: [CardImageComponent, MatButtonModule, MatIconModule, StatusChipComponent],
  template: `
    <div class="olp" role="group" aria-label="Share an offer" (keydown.escape)="cancelled.emit()">
      <div class="olp__head">
        <span class="olp__title">Share an offer with {{ otherName() }}</span>
        <button
          #close
          matIconButton
          type="button"
          aria-label="Cancel sharing an offer"
          (click)="cancelled.emit()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>
      @switch (state()) {
        @case ('loading') {
          <p class="olp__muted" aria-busy="true">Loading your offers…</p>
        }
        @case ('error') {
          <p class="olp__muted" role="alert">
            Your offers could not load.
            <button matButton type="button" (click)="load()">Retry</button>
          </p>
        }
        @default {
          @if (choices().length === 0) {
            <p class="olp__muted">
              No offer with {{ otherName() }} yet. Make one from a card of their binders.
            </p>
          } @else {
            <ul class="olp__list" [attr.aria-label]="'Offers with ' + otherName()">
              @for (choice of choices(); track choice.offerId) {
                <li>
                  <button type="button" class="olp__choice" (click)="picked.emit(choice)">
                    <app-card-image
                      class="olp__img"
                      size="xs"
                      [src]="choice.imageUrl"
                      [game]="choice.game"
                      alt=""
                    />
                    <span class="olp__text">
                      <span class="olp__name">{{ choice.cardName }}</span>
                      <span class="olp__terms">{{ choice.terms }}</span>
                    </span>
                    <app-status-chip
                      [label]="status(choice).label"
                      [icon]="status(choice).icon"
                      [tone]="status(choice).tone"
                    />
                  </button>
                </li>
              }
            </ul>
          }
        }
      }
    </div>
  `,
  styles: `
    .olp {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .olp__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .olp__title {
      font-weight: var(--font-weight-semibold);
    }
    .olp__muted {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .olp__list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 220px;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }
    .olp__choice {
      display: flex;
      align-items: center;
      gap: var(--spacing-3);
      width: 100%;
      padding: var(--spacing-2);
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--color-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .olp__choice:hover,
    .olp__choice:focus-visible {
      background: var(--color-surface-variant);
    }
    .olp__img {
      --card-image-width: 30px;
      --card-image-shadow: none;
    }
    .olp__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .olp__name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .olp__terms {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferLinkPickerComponent {
  private readonly api = inject(OffersService);
  private readonly closeButton = viewChild('close', { read: ElementRef<HTMLButtonElement> });

  /** The other participant of the conversation. */
  readonly otherId = input.required<string>();
  readonly otherName = input('this collector');
  readonly picked = output<OfferLinkChoice>();
  readonly cancelled = output<void>();

  protected readonly state = signal<LoadState>('loading');
  private readonly offers = signal<OfferSummary[]>([]);
  protected readonly choices = computed(() => offerChoices(this.offers(), this.otherId()));

  constructor() {
    void this.load();
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  protected status(choice: OfferLinkChoice) {
    return offerStatusInfo(choice.status);
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const page = await firstValueFrom(
        this.api.listOffers({ limit: RECENT_OFFERS }, 'body', false, { context: silentErrors() }),
      );
      this.offers.set(page.items ?? []);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
