import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { MessageResponse } from '@orenji/api-client';
import { SharedLinkCardComponent } from '../../../shared/links/shared-link-card.component';
import { OfferLinkCardComponent } from '../../../shared/offers/offer-link-card.component';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';
import { SALE_COPY } from '../data/chat-copy';
import { saleSentence } from '../data/deal-rules';
import { OFFER_UNAVAILABLE_TEXT, isOfferMessage } from '../data/message-text';

/**
 * One message (spec 10.3): text (mine `primary`, theirs `chat.otherBubble`, radius 18 with a 6 px
 * tail corner, at most 480 wide), a shared card as the 280 card (with its price when it is the
 * sender's own), a binder, a photo, or a system line. A sale's note uses the `chat.sale*` tokens:
 * "You marked {card} as sold to {buyer}." worded for the reader, "Tracking {n}" (mono), [Rate
 * {other}] and, for the seller within 10 minutes, Undo. An old offer reads "Offer (no longer
 * available)" with its card as history (decision 2). Removed messages keep their place.
 */
@Component({
  selector: 'app-message-bubble',
  imports: [DatePipe, MatIconModule, MediaUrlPipe, OfferLinkCardComponent, SharedLinkCardComponent],
  template: `
    @let m = message();
    @if (m.kind === 'SYSTEM' && m.payload.sale; as sale) {
      <div class="sale" data-testid="sale-note">
        <p class="sale__text">
          <span class="sale__icon" aria-hidden="true">✓</span>
          <span>{{ saleText() }}</span>
        </p>
        @if (sale.quantity > 1) {
          <p class="sale__meta">{{ copies(sale.quantity) }}</p>
        }
        @if (sale.trackingNumber) {
          <p class="sale__tracking">
            <span class="sale__label">{{ copy.tracking }}</span>
            <span class="mono" data-testid="sale-tracking">{{ sale.trackingNumber }}</span>
          </p>
        }
        @if (canRate() || undoOpen()) {
          <div class="sale__actions">
            @if (canRate()) {
              <button type="button" class="sale__action" (click)="rate.emit()">
                {{ copy.rate(otherHandle()) }}
              </button>
            }
            @if (undoOpen()) {
              <button
                type="button"
                class="sale__action sale__action--quiet"
                data-testid="sale-undo"
                [attr.aria-label]="copy.undoLabel(sale.name)"
                (click)="undo.emit(sale.saleId)"
              >
                {{ copy.undo }}
              </button>
            }
          </div>
        }
        <time class="sale__time" [attr.datetime]="m.createdAt">{{
          m.createdAt | date: 'shortTime'
        }}</time>
      </div>
    } @else if (m.kind === 'SYSTEM') {
      <div class="system" data-testid="system-message">
        <p class="system__text">{{ offer() ? offerText + ' · ' + m.body : m.body }}</p>
        @if (m.payload.offer; as offer) {
          <app-offer-link-card class="system__offer" [offer]="offer" />
        }
      </div>
    } @else {
      <div
        class="bubble"
        [class.bubble--own]="own()"
        [class.bubble--flagged]="m.moderationState === 'FLAGGED'"
      >
        @if (m.moderationState === 'REMOVED') {
          <p class="bubble__removed">
            <mat-icon aria-hidden="true">block</mat-icon>
            This message was removed by moderation.
          </p>
        } @else {
          @switch (m.kind) {
            @case ('CARD_LINK') {
              <app-shared-link-card
                class="bubble__link"
                variant="chat"
                [card]="m.payload.card"
                [price]="m.payload.item?.askingPriceText ?? null"
              />
            }
            @case ('BINDER_LINK') {
              <app-shared-link-card
                class="bubble__link"
                variant="chat"
                [binder]="m.payload.binder"
              />
            }
            @case ('IMAGE') {
              @if (m.payload.image; as image) {
                <a
                  class="bubble__photo"
                  [href]="image.url | mediaUrl"
                  target="_blank"
                  rel="noopener"
                >
                  <img
                    [src]="image.url | mediaUrl"
                    [attr.width]="image.width"
                    [attr.height]="image.height"
                    alt="Photo sent in the conversation"
                    loading="lazy"
                  />
                </a>
              }
            }
            @case ('OFFER_LINK') {
              <p class="bubble__text bubble__offer">{{ offerText }}</p>
              @if (m.payload.offer; as offer) {
                <app-offer-link-card class="bubble__link" [offer]="offer" />
              }
            }
          }
          @if (m.body) {
            <p class="bubble__text">{{ m.body }}</p>
          }
        }
        @if (showTime()) {
          <time class="bubble__time" [attr.datetime]="m.createdAt">
            {{ m.createdAt | date: 'shortTime' }}
            @if (m.editedAt) {
              · edited
            }
          </time>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: min(80%, 480px);
    }
    :host:has(.system),
    :host:has(.sale) {
      max-width: min(100%, 480px);
      margin-inline: auto;
    }
    .sale {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-chat-sale-border);
      border-radius: var(--radius-row);
      background: var(--color-chat-sale-surface);
      color: var(--color-chat-sale-text);
    }
    .sale__text {
      display: flex;
      gap: var(--spacing-2);
      margin: 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .sale__icon {
      color: var(--color-chat-sale-label);
    }
    .sale__meta {
      margin: 0 0 0 22px;
      font-size: var(--font-size-xs);
    }
    .sale__tracking {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0 0 0 22px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      background: var(--color-chat-sale-tracking-surface);
      font-size: var(--font-size-sm);
    }
    .sale__label {
      color: var(--color-chat-sale-label);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .sale__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      margin-left: 22px;
    }
    .sale__action {
      height: 32px;
      padding: 0 14px;
      border: 1.5px solid var(--color-chat-sale-action);
      border-radius: var(--radius-pill);
      background: transparent;
      color: var(--color-chat-sale-action);
      font: inherit;
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-bold);
      cursor: pointer;
    }
    .sale__action--quiet {
      border-color: transparent;
    }
    .sale__action:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .sale__time {
      align-self: flex-end;
      font-size: var(--font-size-xs);
      opacity: 0.8;
    }
    .bubble__offer {
      font-style: italic;
    }
    .system {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: var(--spacing-2);
    }
    .system__text {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
      text-align: center;
    }
    .bubble {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: 18px 18px 18px 6px;
      background: var(--color-chat-other-bubble);
      color: var(--color-ink);
      animation: bubble-in var(--motion-duration-base) var(--motion-easing-standard);
    }
    .bubble--own {
      border-radius: 18px 18px 6px 18px;
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .bubble--flagged {
      outline: 1px dashed var(--color-warning);
    }
    .bubble__text {
      margin: 0;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .bubble__link {
      color: var(--color-ink);
    }
    .bubble__photo img {
      display: block;
      width: 100%;
      max-width: 280px;
      height: auto;
      max-height: 320px;
      border-radius: var(--radius-md);
      object-fit: cover;
    }
    .bubble__removed {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      font-style: italic;
    }
    .bubble__time {
      align-self: flex-end;
      font-size: var(--font-size-xs);
      opacity: 0.75;
    }
    @keyframes bubble-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bubble {
        animation: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageBubbleComponent {
  readonly message = input.required<MessageResponse>();
  readonly own = input(false);
  /** Last message of a run: carries its time. */
  readonly showTime = input(true);
  /** The reader (a sale's note is worded for them). */
  readonly selfId = input<string | null>(null);
  /** The other collector's handle. */
  readonly otherHandle = input('');
  /** The reader may rate the other collector ([Rate {other}] on a sale's note). */
  readonly canRate = input(false);
  /** The seller may still undo this sale (within its 10 minutes). */
  readonly undoOpen = input(false);
  readonly rate = output<void>();
  readonly undo = output<string>();

  protected readonly copy = SALE_COPY;
  protected readonly offerText = OFFER_UNAVAILABLE_TEXT;
  protected readonly offer = computed(() => isOfferMessage(this.message()));
  protected readonly saleText = computed(() => {
    const sale = this.message().payload.sale;
    return sale ? saleSentence(sale, this.selfId(), this.otherHandle()) : '';
  });

  protected copies(count: number): string {
    return SALE_COPY.copies(count);
  }
}
