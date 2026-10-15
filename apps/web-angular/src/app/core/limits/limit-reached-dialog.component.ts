import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { formatLimitValue, limitLabel, limitPeriod } from '../../shared/limits/limit-labels';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { LimitReachedInfo } from './limit-reached';

/** Opens the dialog (called lazily by `LimitReachedService`). */
export function openLimitReachedDialog(
  injector: Injector,
  info: LimitReachedInfo,
): MatDialogRef<LimitReachedDialogComponent, void> {
  return injector
    .get(MatDialog)
    .open<LimitReachedDialogComponent, LimitReachedInfo, void>(LimitReachedDialogComponent, {
      data: info,
      role: 'alertdialog',
      panelClass: 'app-dialog--md',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
}

/**
 * Explains a reached usage limit plainly: which limit, how much was used and when it resets. The
 * limits are the same for every collector and nothing is sold to lift them (stage F1, "free for
 * all"): no plan, no upgrade link.
 */
@Component({
  selector: 'app-limit-reached-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, RelativeTimePipe],
  template: `
    <div class="limit__hero" aria-hidden="true">
      <mat-icon class="limit__icon">speed</mat-icon>
    </div>
    <h2 mat-dialog-title class="limit__title">You reached a limit</h2>
    <mat-dialog-content>
      <p class="limit__lead" data-testid="limit-summary">
        <strong>{{ label() }}</strong>
        @if (info.used !== null && info.limit !== null) {
          — you used {{ info.used }} of {{ info.limit }} {{ period() }}.
        } @else {
          — you cannot go further for now.
        }
      </p>

      @if (percent() !== null) {
        <div class="limit__meter" aria-hidden="true">
          <span class="limit__meter-fill" [style.width.%]="percent()"></span>
        </div>
      }

      <dl class="limit__facts">
        <div class="limit__fact">
          <dt>Usage</dt>
          <dd>{{ usageText() }}</dd>
        </div>
        <div class="limit__fact">
          <dt>Resets</dt>
          <dd data-testid="limit-reset">
            @if (info.resetsAt) {
              {{ info.resetsAt | relativeTime }}
              <span class="limit__muted">({{ info.resetsAt | date: 'medium' }})</span>
            } @else {
              Does not reset on its own: it counts everything on your account.
            }
          </dd>
        </div>
      </dl>
      <p class="limit__note" data-testid="limit-note">Every collector has the same limits.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton="filled" type="button" mat-dialog-close>OK</button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }
    .limit__hero {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      margin: var(--spacing-5) var(--spacing-6) 0;
      border-radius: var(--radius-pill);
      background: var(--color-primary-container);
      color: var(--color-on-primary-container);
    }
    .limit__icon {
      width: 30px;
      height: 30px;
      font-size: 30px;
    }
    .limit__lead {
      color: var(--color-ink);
    }
    .limit__meter {
      height: 8px;
      margin-bottom: var(--spacing-4);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      overflow: hidden;
    }
    .limit__meter-fill {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--color-warning), var(--color-danger));
    }
    .limit__facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--spacing-3);
      margin: 0 0 var(--spacing-4);
    }
    .limit__fact dt {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }
    .limit__fact dd {
      margin: 2px 0 0;
      color: var(--color-ink);
    }
    .limit__muted {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .limit__note {
      margin: 0;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimitReachedDialogComponent {
  protected readonly info = inject<LimitReachedInfo>(MAT_DIALOG_DATA);

  protected readonly label = computed(() => limitLabel(this.info.limitKey));
  protected readonly period = computed(() => limitPeriod(this.info.limitKey));
  protected readonly usageText = computed(() =>
    this.info.used === null
      ? `Limit ${formatLimitValue(this.info.limit)}`
      : `${this.info.used} of ${formatLimitValue(this.info.limit)}`,
  );
  protected readonly percent = computed(() => {
    const { used, limit } = this.info;
    if (used === null || limit === null) {
      return null;
    }
    return limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  });
}
