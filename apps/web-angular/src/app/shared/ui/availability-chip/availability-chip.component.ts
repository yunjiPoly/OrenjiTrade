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
    /*
     * AA in both themes (web WB, carried over from WA's review): the label is the theme's text on
     * a faint tint of the availability colour, never white on the colour itself (white on the
     * light orange was 2.8:1, on the dark teal 1.9:1). The icon carries the colour.
     */
    .chip {
      --chip-color: var(--color-availability-collection);
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      padding: 2px var(--spacing-2) 2px 6px;
      border-radius: var(--radius-pill);
      border: 1px solid color-mix(in srgb, var(--chip-color) 45%, var(--color-surface));
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      line-height: 1.6;
      color: var(--color-ink);
      background: color-mix(in srgb, var(--chip-color) 14%, var(--color-surface));
    }
    .chip__icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: var(--chip-color);
    }
    .chip--trade {
      --chip-color: var(--color-availability-trade);
    }
    .chip--sale {
      --chip-color: var(--color-availability-sale);
    }
    .chip--trade-or-sale {
      --chip-color: var(--color-availability-trade);
      border-color: color-mix(in srgb, var(--color-availability-sale) 45%, var(--color-surface));
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--color-availability-trade) 14%, var(--color-surface)) 0%,
        color-mix(in srgb, var(--color-availability-sale) 14%, var(--color-surface)) 100%
      );
    }
    .chip--offers {
      --chip-color: var(--color-availability-offers);
    }
    .chip--not-available {
      --chip-color: var(--color-availability-not-available);
      background: transparent;
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvailabilityChipComponent {
  readonly availability = input.required<Availability>();
  protected readonly info = computed(() => AVAILABILITIES[this.availability()]);
}
