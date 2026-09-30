import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { MessageResponse } from '@orenji/api-client';
import { SharedLinkCardComponent } from '../../../shared/links/shared-link-card.component';
import { OfferLinkCardComponent } from '../../../shared/offers/offer-link-card.component';
import { MediaUrlPipe } from '../../../shared/pipes/media-url.pipe';

/**
 * One message: text, shared card or binder (with an optional caption), photo, offer card (links
 * to the offer page) or a system line (offer and trade updates carry the offer card too). Removed
 * messages keep their place with a neutral note.
 */
@Component({
  selector: 'app-message-bubble',
  imports: [DatePipe, MatIconModule, MediaUrlPipe, OfferLinkCardComponent, SharedLinkCardComponent],
  template: `
    @let m = message();
    @if (m.kind === 'SYSTEM') {
      <div class="system" data-testid="system-message">
        <p class="system__text">{{ m.body }}</p>
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
              <app-shared-link-card class="bubble__link" [card]="m.payload.card" />
            }
            @case ('BINDER_LINK') {
              <app-shared-link-card class="bubble__link" [binder]="m.payload.binder" />
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
      max-width: min(80%, 420px);
    }
    :host:has(.system) {
      max-width: min(100%, 460px);
      margin-inline: auto;
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
      background: var(--color-surface-variant);
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
}
