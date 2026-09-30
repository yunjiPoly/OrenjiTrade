import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  numberAttribute,
  output,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MAX_QUANTITY } from '../data/item-form';

/** − 2 + stepper for the number of copies; emits the new quantity (never below 1). */
@Component({
  selector: 'app-quantity-stepper',
  imports: [MatIconModule],
  template: `
    <span class="qs" role="group" [attr.aria-label]="'Quantity of ' + label()">
      <button
        type="button"
        class="qs__btn"
        [disabled]="disabled() || value() <= min()"
        [attr.aria-label]="'Decrease quantity of ' + label()"
        (click)="step(-1)"
      >
        <mat-icon aria-hidden="true">remove</mat-icon>
      </button>
      <span class="qs__value" aria-live="polite" data-testid="quantity">{{ value() }}</span>
      <button
        type="button"
        class="qs__btn"
        [disabled]="disabled() || value() >= max()"
        [attr.aria-label]="'Increase quantity of ' + label()"
        (click)="step(1)"
      >
        <mat-icon aria-hidden="true">add</mat-icon>
      </button>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .qs {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: var(--color-surface);
      overflow: hidden;
    }
    .qs__btn {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--color-ink);
      cursor: pointer;
      transition: background var(--motion-duration-fast) var(--motion-easing-standard);
    }
    .qs__btn:hover:not(:disabled) {
      background: var(--color-surface-variant);
    }
    .qs__btn:disabled {
      color: var(--color-text-disabled);
      cursor: default;
    }
    .qs__btn:focus-visible {
      outline-offset: -2px;
    }
    .qs__btn mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .qs__value {
      min-width: 2ch;
      padding: 0 2px;
      text-align: center;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuantityStepperComponent {
  readonly value = input.required({ transform: numberAttribute });
  /** Card name for the accessible labels. */
  readonly label = input('card');
  readonly min = input(1, { transform: numberAttribute });
  readonly max = input(MAX_QUANTITY, { transform: numberAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly valueChange = output<number>();

  protected step(delta: number): void {
    const next = Math.min(this.max(), Math.max(this.min(), this.value() + delta));
    if (next !== this.value()) {
      this.valueChange.emit(next);
    }
  }
}
