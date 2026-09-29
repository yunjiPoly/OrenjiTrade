import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AVAILABILITIES, Availability } from './availability';

/** Availability chip coloured by the design-system status palette. */
@Component({
  selector: 'app-availability-chip',
  imports: [MatIconModule],
  template: `
    <span class="chip" [class]="'chip chip--' + info().modifier">
      <mat-icon class="chip__icon" inline aria-hidden="true">{{ info().icon }}</mat-icon>
      <span class="chip__label">{{ info().label }}</span>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      padding: 2px var(--spacing-2) 2px 6px;
      border-radius: var(--radius-pill);
      border: 1px solid transparent;
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      line-height: 1.6;
      color: #fff;
      background: var(--color-availability-collection);
    }
    .chip__icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }
    .chip--trade {
      background: var(--color-availability-trade);
    }
    .chip--sale {
      background: var(--color-availability-sale);
    }
    .chip--trade-or-sale {
      background: var(--color-availability-trade-or-sale);
    }
    .chip--offers {
      background: var(--color-availability-offers);
    }
    .chip--not-available {
      background: transparent;
      border-color: var(--color-availability-not-available);
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvailabilityChipComponent {
  readonly availability = input.required<Availability>();
  protected readonly info = computed(() => AVAILABILITIES[this.availability()]);
}
