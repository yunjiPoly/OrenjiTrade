import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { OfferAction } from '../../../shared/offers/offer-labels';

/**
 * The answers to a proposal, only those the API allows the viewer now (`allowedActions`): Accept,
 * Counter, Decline for the party whose turn it is, Withdraw for the buyer while the offer is
 * OPEN. Otherwise it says whom the offer waits for. "Message" opens the pair conversation.
 */
@Component({
  selector: 'app-offer-action-bar',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <section class="bar" [class.bar--turn]="yourTurn()" aria-label="Your answer">
      <div class="bar__text">
        @if (yourTurn()) {
          <p class="bar__title">
            <mat-icon aria-hidden="true">notifications_active</mat-icon>
            Your turn to answer
          </p>
          <p class="bar__hint">Accept to open a trade, counter with other terms, or decline.</p>
        } @else if (waiting()) {
          <p class="bar__title">
            <mat-icon aria-hidden="true">hourglass_top</mat-icon>
            Waiting for {{ otherName() }}
          </p>
          <p class="bar__hint">You will be notified as soon as {{ otherName() }} answers.</p>
        } @else {
          <p class="bar__title">
            <mat-icon aria-hidden="true">lock_clock</mat-icon>
            This negotiation is closed
          </p>
        }
      </div>
      <div class="bar__actions">
        @if (can('ACCEPT')) {
          <button
            matButton="filled"
            type="button"
            [disabled]="!!busy()"
            (click)="acceptRequested.emit()"
          >
            <mat-icon aria-hidden="true">handshake</mat-icon>
            {{ busy() === 'ACCEPT' ? 'Accepting…' : 'Accept' }}
          </button>
        }
        @if (can('COUNTER')) {
          <button
            matButton="outlined"
            type="button"
            [disabled]="!!busy()"
            (click)="counterRequested.emit()"
          >
            <mat-icon aria-hidden="true">swap_horiz</mat-icon>
            Counter
          </button>
        }
        @if (can('DECLINE')) {
          <button
            matButton
            type="button"
            class="bar__danger"
            [disabled]="!!busy()"
            (click)="declineRequested.emit()"
          >
            <mat-icon aria-hidden="true">do_not_disturb_on</mat-icon>
            {{ busy() === 'DECLINE' ? 'Declining…' : 'Decline' }}
          </button>
        }
        @if (can('CANCEL')) {
          <button
            matButton
            type="button"
            class="bar__danger"
            [disabled]="!!busy()"
            (click)="withdrawRequested.emit()"
          >
            <mat-icon aria-hidden="true">undo</mat-icon>
            {{ busy() === 'CANCEL' ? 'Withdrawing…' : 'Withdraw offer' }}
          </button>
        }
        <button matButton type="button" [disabled]="messaging()" (click)="messageRequested.emit()">
          <mat-icon aria-hidden="true">chat</mat-icon>
          {{ messaging() ? 'Opening…' : 'Message ' + otherName() }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-3) var(--spacing-4);
      padding: var(--spacing-4);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
    }
    .bar--turn {
      border-color: var(--color-primary);
      background: color-mix(in srgb, var(--color-primary) 7%, var(--color-surface));
      box-shadow: var(--elevation-floating);
    }
    .bar__text {
      min-width: 0;
    }
    .bar__title {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      margin: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .bar--turn .bar__title mat-icon {
      color: var(--color-primary);
    }
    .bar__hint {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .bar__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
    }
    .bar__danger {
      --mat-button-text-label-text-color: var(--color-danger);
    }
    @media (max-width: 599px) {
      .bar__actions {
        width: 100%;
      }
      .bar__actions button {
        flex: 1 1 auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferActionBarComponent {
  readonly allowedActions = input.required<readonly string[]>();
  readonly busy = input<OfferAction | null>(null);
  readonly yourTurn = input(false);
  readonly waiting = input(false);
  readonly otherName = input.required<string>();
  readonly messaging = input(false);

  readonly acceptRequested = output<void>();
  readonly counterRequested = output<void>();
  readonly declineRequested = output<void>();
  readonly withdrawRequested = output<void>();
  readonly messageRequested = output<void>();

  private readonly allowed = computed(() => new Set(this.allowedActions()));

  protected can(action: OfferAction): boolean {
    return this.allowed().has(action);
  }
}
