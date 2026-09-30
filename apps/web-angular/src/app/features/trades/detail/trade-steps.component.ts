import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { TradeResponse } from '@orenji/api-client';

interface Mark {
  who: string;
  done: boolean;
  at?: string | null;
}

interface Step {
  key: string;
  title: string;
  hint: string;
  state: 'done' | 'current' | 'todo' | 'skipped';
  marks: Mark[];
  /** When the step happened (protected trades). */
  at?: string | null;
}

const SECURED_OR_LATER = new Set([
  'SECURED',
  'PAYOUT_PENDING',
  'PAID_OUT',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

/**
 * Progress of a trade. Meetup trades: offer accepted → in-person meetup (both marks, optional)
 * → exchange confirmed by both → completed; each party's mark is shown ("You", the other).
 * Trades with payment protection (Phase 9): offer accepted → payment secured → shipped →
 * received (or the dispute) → completed with the payout released.
 */
@Component({
  selector: 'app-trade-steps',
  imports: [DatePipe, MatIconModule],
  template: `
    <ol class="steps" [class.steps--five]="steps().length === 5" aria-label="Trade progress">
      @for (step of steps(); track step.key) {
        <li class="step" [attr.data-state]="step.state" [attr.data-testid]="'step-' + step.key">
          <span class="step__dot" aria-hidden="true">
            <mat-icon>{{
              step.state === 'done' ? 'check' : step.state === 'skipped' ? 'remove' : 'circle'
            }}</mat-icon>
          </span>
          <div class="step__body">
            <p class="step__title">
              {{ step.title }}
              <span class="visually-hidden">({{ stateLabel(step.state) }})</span>
            </p>
            <p class="step__hint">{{ step.hint }}</p>
            @if (step.at) {
              <p class="step__at">{{ step.at | date: 'MMM d, h:mm a' }}</p>
            }
            @if (step.marks.length > 0) {
              <ul class="marks">
                @for (mark of step.marks; track mark.who) {
                  <li class="mark" [class.mark--done]="mark.done">
                    <mat-icon aria-hidden="true">{{
                      mark.done ? 'check_circle' : 'radio_button_unchecked'
                    }}</mat-icon>
                    {{ mark.who }}:
                    {{ mark.done ? 'done' : 'not yet' }}
                    @if (mark.at) {
                      <span class="mark__at">· {{ mark.at | date: 'MMM d, h:mm a' }}</span>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    .steps {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--spacing-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .step {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .step[data-state='current'] {
      border-color: var(--color-primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
    }
    .step[data-state='skipped'] {
      opacity: 0.75;
    }
    .step__dot {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--color-surface-variant);
      color: var(--color-text-muted);
    }
    .step__dot mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .step[data-state='done'] .step__dot {
      background: var(--color-success);
      color: #fff;
    }
    .step[data-state='current'] .step__dot {
      background: var(--color-primary);
      color: var(--color-on-primary);
    }
    .step__title {
      margin: 0;
      color: var(--color-ink);
      font-weight: var(--font-weight-semibold);
    }
    .step__hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .step__at {
      margin: 0;
      color: var(--color-ink);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
    }
    .marks {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .mark {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .mark mat-icon {
      width: 14px;
      height: 14px;
      font-size: 14px;
    }
    .mark--done {
      color: var(--color-ink);
    }
    .mark--done mat-icon {
      color: var(--color-success);
    }
    .steps--five {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    @media (max-width: 959px) {
      .steps,
      .steps--five {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 479px) {
      .steps,
      .steps--five {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradeStepsComponent {
  readonly trade = input.required<TradeResponse>();

  protected readonly steps = computed<Step[]>(() => {
    const trade = this.trade();
    if (trade.protectionEnabled && !trade.meetup) {
      return this.protectedSteps(trade);
    }
    const buyer = trade.viewerRole === 'BUYER';
    const other = trade.counterparty.displayName;
    const cancelled = trade.status === 'CANCELLED';
    const completed = trade.status === 'COMPLETED';
    const meMeetup = buyer ? trade.buyerMarkedMeetup : trade.sellerMarkedMeetup;
    const otherMeetup = buyer ? trade.sellerMarkedMeetup : trade.buyerMarkedMeetup;
    const meConfirmed = buyer ? trade.buyerConfirmedAt : trade.sellerConfirmedAt;
    const otherConfirmed = buyer ? trade.sellerConfirmedAt : trade.buyerConfirmedAt;
    const confirmedBoth = !!meConfirmed && !!otherConfirmed;
    const open = !cancelled && !completed;
    return [
      {
        key: 'accepted',
        title: 'Offer accepted',
        hint: 'You agreed on the deal.',
        state: 'done',
        marks: [],
      },
      {
        key: 'meetup',
        title: 'In-person meetup',
        hint: 'Optional: both of you mark that you meet in person.',
        state: trade.meetup ? 'done' : open ? (meMeetup ? 'todo' : 'current') : 'skipped',
        marks: [
          { who: 'You', done: meMeetup },
          { who: other, done: otherMeetup },
        ],
      },
      {
        key: 'confirmed',
        title: 'Exchange confirmed',
        hint: 'After the exchange, both of you confirm it.',
        state: confirmedBoth ? 'done' : open ? (meConfirmed ? 'todo' : 'current') : 'skipped',
        marks: [
          { who: 'You', done: !!meConfirmed, at: meConfirmed },
          { who: other, done: !!otherConfirmed, at: otherConfirmed },
        ],
      },
      {
        key: 'completed',
        title: cancelled ? 'Cancelled' : 'Completed',
        hint: cancelled
          ? 'The trade was cancelled.'
          : 'The cards leave the inventories; you can rate each other.',
        state: completed ? 'done' : cancelled ? 'skipped' : 'todo',
        marks: [],
      },
    ];
  });

  private protectedSteps(trade: TradeResponse): Step[] {
    const buyer = trade.viewerRole === 'BUYER';
    const other = trade.counterparty.displayName;
    const status = trade.status;
    const cancelled = status === 'CANCELLED';
    const completed = status === 'COMPLETED';
    const disputed = !!trade.dispute;
    const payment = trade.payment;
    const secured = !!payment && SECURED_OR_LATER.has(payment.status);
    const shipped = !!trade.shipment;
    const received = completed || status === 'RECEIVED';
    const state = (done: boolean, current: boolean): Step['state'] =>
      done ? 'done' : cancelled ? 'skipped' : current ? 'current' : 'todo';
    const steps: Step[] = [
      {
        key: 'accepted',
        title: 'Offer accepted',
        hint: 'You agreed on the deal with payment protection.',
        state: 'done',
        marks: [],
      },
      {
        key: 'paid',
        title: 'Payment secured',
        hint: buyer
          ? 'You pay; the payment provider holds the money.'
          : `${other} pays; the payment provider holds the money.`,
        state: state(secured, status === 'AWAITING_PAYMENT'),
        marks: [],
        at: payment?.securedAt ?? null,
      },
      {
        key: 'shipped',
        title: 'Shipped',
        hint: buyer ? `${other} ships the card with tracking.` : 'You ship the card with tracking.',
        state: state(shipped, status === 'PAID'),
        marks: [],
        at: trade.shipment?.shippedAt ?? null,
      },
      disputed
        ? {
            key: 'dispute',
            title: 'Dispute',
            hint: trade.dispute?.resolvedAt
              ? 'An OrenjiTrade admin decided.'
              : 'An OrenjiTrade admin reviews it; the payout is on hold.',
            state: trade.dispute?.resolvedAt ? 'done' : 'current',
            marks: [],
            at: trade.dispute?.openedAt ?? null,
          }
        : {
            key: 'received',
            title: 'Received',
            hint: buyer
              ? 'You confirm the card arrived as described.'
              : `${other} confirms the card arrived.`,
            state: state(received, status === 'SHIPPED'),
            marks: [],
          },
      {
        key: 'completed',
        title: cancelled ? 'Cancelled' : 'Payout released',
        hint: cancelled
          ? 'The trade was cancelled.'
          : buyer
            ? `The payout goes to ${other}; you can rate each other.`
            : 'Your payout is released; you can rate each other.',
        state: completed ? 'done' : cancelled ? 'skipped' : 'todo',
        marks: [],
        at: payment?.payoutReleasedAt ?? null,
      },
    ];
    return steps;
  }

  protected stateLabel(state: Step['state']): string {
    switch (state) {
      case 'done':
        return 'done';
      case 'current':
        return 'your next step';
      case 'skipped':
        return 'skipped';
      default:
        return 'to do';
    }
  }
}
