import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PAYMENTS_NOTICE } from '../../core/routing/legacy-redirects';

/**
 * What an old checkout or dispute link shows (spec 4.11, decision 2, ADR 0018): payments and
 * disputes are not part of OrenjiTrade; deals happen in the chat and the buyer pays by
 * e-Transfer outside the app. [Go to Messages].
 */
@Component({
  selector: 'app-payments-notice-page',
  imports: [RouterLink],
  template: `
    <div class="page notice">
      <h1 class="notice__title">Deals happen in the chat</h1>
      <p class="notice__text" data-testid="payments-notice">{{ text }}</p>
      <a class="notice__action" routerLink="/messages">Go to Messages</a>
    </div>
  `,
  styles: `
    .notice {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--spacing-4);
      max-width: 68ch;
      padding-top: var(--spacing-12);
    }
    .notice__title {
      font-size: var(--font-size-3xl);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.5px;
    }
    .notice__text {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-body);
      line-height: 24px;
    }
    .notice__action {
      display: inline-flex;
      align-items: center;
      height: 44px;
      padding: 0 20px;
      border-radius: var(--radius-pill);
      background: var(--color-primary);
      color: var(--color-on-primary);
      font-weight: var(--font-weight-bold);
      text-decoration: none;
    }
    .notice__action:hover {
      background: var(--color-primary-hover);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsNoticePageComponent {
  protected readonly text = PAYMENTS_NOTICE;
}
