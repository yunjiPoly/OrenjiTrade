import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  booleanAttribute,
  computed,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { AdminUsageLimit } from '@orenji/api-client';
import { windowSuffix } from '../../../shared/plans/plan-labels';
import { limitValueError } from './limit-matrix';

export interface LimitEdit {
  limit: AdminUsageLimit;
  unlimited: boolean;
  maxValue: number | null;
}

/**
 * One plan x limit cell: the value, and for super admins an inline editor (number or unlimited,
 * Enter saves, Escape cancels) with validation.
 */
@Component({
  selector: 'app-limit-cell',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule, MatTooltipModule],
  template: `
    @if (!limit()) {
      <span class="cell__none">Not set</span>
    } @else if (editing()) {
      <div class="cell__editor" role="group" [attr.aria-label]="'Edit ' + name()">
        <label class="visually-hidden" [for]="inputId()">{{ name() }} value</label>
        <input
          #valueInput
          class="cell__input"
          type="number"
          inputmode="numeric"
          min="0"
          step="1"
          [id]="inputId()"
          [value]="draft()"
          [disabled]="unlimited() || saving()"
          [attr.aria-invalid]="!!error()"
          [attr.aria-describedby]="error() ? inputId() + '-error' : null"
          (input)="draft.set(valueInput.value)"
          (keydown.enter)="save($event)"
          (keydown.escape)="cancel()"
        />
        <mat-checkbox
          [checked]="unlimited()"
          [disabled]="saving()"
          (change)="unlimited.set($event.checked)"
        >
          Unlimited
        </mat-checkbox>
        <span class="cell__actions">
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Save ' + name()"
            [disabled]="saving()"
            (click)="save()"
          >
            <mat-icon>check</mat-icon>
          </button>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Cancel editing ' + name()"
            [disabled]="saving()"
            (click)="cancel()"
          >
            <mat-icon>close</mat-icon>
          </button>
        </span>
        @if (error()) {
          <span class="cell__error" role="alert" [id]="inputId() + '-error'">{{ error() }}</span>
        }
      </div>
    } @else {
      <div class="cell__view">
        <span
          class="cell__value"
          [attr.data-testid]="'limit-' + limit()!.planCode + '-' + limit()!.key"
        >
          @if (limit()!.unlimited) {
            <span class="cell__unlimited">Unlimited</span>
          } @else {
            {{ limit()!.maxValue }}
          }
        </span>
        @if (suffix()) {
          <span class="cell__suffix">{{ suffix() }}</span>
        }
        @if (canEdit()) {
          <button
            matIconButton
            type="button"
            class="cell__edit"
            [attr.aria-label]="'Edit ' + name()"
            matTooltip="Edit"
            (click)="start()"
          >
            <mat-icon>edit</mat-icon>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .cell__view {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
    }
    .cell__value {
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
    .cell__unlimited {
      color: var(--color-success);
    }
    .cell__suffix,
    .cell__none {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .cell__edit {
      margin-left: auto;
    }
    .cell__editor {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-1) var(--spacing-2);
    }
    .cell__input {
      width: 96px;
      padding: 6px var(--spacing-2);
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
    }
    .cell__input[aria-invalid='true'] {
      border-color: var(--color-danger);
    }
    .cell__input:disabled {
      opacity: 0.5;
    }
    .cell__actions {
      display: inline-flex;
    }
    .cell__error {
      flex: 1 0 100%;
      color: var(--color-danger);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LimitCellComponent {
  readonly limit = input<AdminUsageLimit | null>(null);
  readonly planName = input('');
  readonly canEdit = input(false, { transform: booleanAttribute });
  readonly saving = input(false, { transform: booleanAttribute });
  readonly edit = output<LimitEdit>();

  private readonly valueInput = viewChild<ElementRef<HTMLInputElement>>('valueInput');
  /** Closes by itself when the parent passes the saved limit (a new object). */
  protected readonly editing = linkedSignal({ source: this.limit, computation: () => false });
  protected readonly draft = signal('');
  protected readonly unlimited = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly name = computed(() => `${this.planName()} ${this.limit()?.key ?? ''}`.trim());
  protected readonly inputId = computed(() => `limit-${this.limit()?.id ?? 'none'}`);
  protected readonly suffix = computed(() =>
    this.limit()?.unlimited ? '' : windowSuffix(this.limit()?.window),
  );

  protected start(): void {
    const limit = this.limit();
    if (!limit) {
      return;
    }
    this.draft.set(limit.unlimited ? '' : String(limit.maxValue ?? ''));
    this.unlimited.set(!!limit.unlimited);
    this.error.set(null);
    this.editing.set(true);
    setTimeout(() => this.valueInput()?.nativeElement.focus());
  }

  protected cancel(): void {
    this.editing.set(false);
    this.error.set(null);
  }

  protected save(event?: Event): void {
    event?.preventDefault();
    const limit = this.limit();
    if (!limit) {
      return;
    }
    const error = limitValueError(this.unlimited(), this.draft());
    this.error.set(error);
    if (error) {
      return;
    }
    this.edit.emit({
      limit,
      unlimited: this.unlimited(),
      maxValue: this.unlimited() ? null : Number(this.draft()),
    });
  }
}
