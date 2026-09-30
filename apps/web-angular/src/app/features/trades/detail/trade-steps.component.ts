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
}

/**
 * Progress of a meetup trade: offer accepted → in-person meetup (both marks, optional) →
 * exchange confirmed by both → completed; each party's mark is shown ("You", the other).
 */
@Component({
  selector: 'app-trade-steps',
  imports: [DatePipe, MatIconModule],
  template: `
    <ol class="steps" aria-label="Trade progress">
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
    @media (max-width: 959px) {
      .steps {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 479px) {
      .steps {
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
