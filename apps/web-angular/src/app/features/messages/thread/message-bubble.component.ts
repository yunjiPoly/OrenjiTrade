import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { MessageResponse } from '@orenji/api-client';
import { SharedLinkCardComponent } from '../../../shared/links/shared-link-card.component';

/**
 * One message: text, shared card or binder (with an optional caption), photo, offer summary or a
 * system line. Removed messages keep their place with a neutral note.
 */
@Component({
  selector: 'app-message-bubble',
  imports: [DatePipe, MatIconModule, SharedLinkCardComponent],
  template: `
    @let m = message();
    @if (m.kind === 'SYSTEM') {
      <p class="system">{{ m.body }}</p>
    } @else {
      <div class="bubble" [class.bubble--own]="own()" [class.bubble--flagged]="m.moderationState === 'FLAGGED'">
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
                <a class="bubble__photo" [href]="image.url" target="_blank" rel="noopener">
                  <img
                    [src]="image.url"
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
                <p class="bubble__offer">
                  <mat-icon aria-hidden="true">local_offer</mat-icon>
                  {{ offer.summary }} · {{ offer.status }}
                </p>
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
    .system {
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
    .bubble__offer,
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
