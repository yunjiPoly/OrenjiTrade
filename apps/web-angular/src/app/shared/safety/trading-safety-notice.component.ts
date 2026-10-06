import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SafetyNoticeContext, SafetyNoticeService } from './safety-notice.service';

/** Wording per context (English UI; the linked page exists in English and French). */
const COPY: Record<SafetyNoticeContext, { title: string; text: string }> = {
  conversation: {
    title: 'Trade safely',
    text:
      'Meet in a busy public place in daylight, bring someone along for valuable cards, never ' +
      'share your home address, and check the cards before any money changes hands.',
  },
  trade: {
    title: 'Trade safely',
    text:
      'Meet in a busy public place in daylight, bring someone along for valuable cards, never ' +
      'share your home address, and check the cards before any money changes hands. Be wary of ' +
      'pressure and of requests to pay outside the agreed method.',
  },
};

/**
 * Short, dismissible trading safety reminder shown in a conversation and on the offer / trade
 * pages until the collector dismisses it (per user, per context, see
 * {@link SafetyNoticeService}). It never blocks anything: the page around it keeps working.
 * Links to the "Trading safely" page and offers Report / Block (the parent performs them).
 */
@Component({
  selector: 'app-trading-safety-notice',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    @if (!dismissed()) {
      <aside
        class="notice"
        role="note"
        aria-labelledby="safety-notice-title"
        data-testid="safety-notice"
        [attr.data-context]="context()"
      >
        <mat-icon class="notice__icon" aria-hidden="true">shield_person</mat-icon>
        <div class="notice__body">
          <p class="notice__title" id="safety-notice-title">{{ copy().title }}</p>
          <p class="notice__text">
            {{ copy().text }}
            <a class="notice__link" routerLink="/legal/trading-safely" data-testid="safety-guide"
              >Read our trading safety advice</a
            >.
          </p>
          @if (showReport() || showBlock()) {
            <p class="notice__actions">
              @if (showReport()) {
                <button
                  matButton
                  type="button"
                  [attr.aria-label]="'Report ' + otherName()"
                  (click)="reportRequested.emit()"
                >
                  <mat-icon aria-hidden="true">flag</mat-icon>
                  Report
                </button>
              }
              @if (showBlock()) {
                <button
                  matButton
                  type="button"
                  [attr.aria-label]="'Block ' + otherName()"
                  (click)="blockRequested.emit()"
                >
                  <mat-icon aria-hidden="true">block</mat-icon>
                  Block
                </button>
              }
            </p>
          }
        </div>
        <button
          matIconButton
          type="button"
          class="notice__dismiss"
          aria-label="Dismiss the safety notice"
          (click)="dismiss()"
        >
          <mat-icon>close</mat-icon>
        </button>
      </aside>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .notice {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-3);
      padding: var(--spacing-3) var(--spacing-2) var(--spacing-3) var(--spacing-4);
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--color-primary);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
      font-size: var(--font-size-sm);
    }
    .notice__icon {
      flex: 0 0 auto;
      color: var(--color-primary);
    }
    .notice__body {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--spacing-1);
      min-width: 0;
    }
    .notice__title {
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .notice__text {
      margin: 0;
      color: var(--color-text-muted);
    }
    .notice__link {
      color: var(--color-primary);
      font-weight: var(--font-weight-medium);
    }
    .notice__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-1);
      margin: var(--spacing-1) 0 0 calc(-1 * var(--spacing-2));
    }
    .notice__dismiss {
      flex: 0 0 auto;
      margin: calc(-1 * var(--spacing-1)) 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TradingSafetyNoticeComponent {
  private readonly service = inject(SafetyNoticeService);

  readonly context = input.required<SafetyNoticeContext>();
  /** Display name of the other collector (Report / Block button labels). */
  readonly otherName = input('this collector');
  readonly showReport = input(true, { transform: booleanAttribute });
  readonly showBlock = input(true, { transform: booleanAttribute });
  readonly reportRequested = output<void>();
  readonly blockRequested = output<void>();

  protected readonly copy = computed(() => COPY[this.context()]);
  protected readonly dismissed = computed(() => this.service.dismissed(this.context())());

  protected dismiss(): void {
    this.service.dismiss(this.context());
  }
}
