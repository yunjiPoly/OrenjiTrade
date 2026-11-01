import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AvailabilityChipComponent } from '../../ui/availability-chip/availability-chip.component';
import { ConditionChipComponent } from '../../ui/condition-chip/condition-chip.component';
import { conditionLabel, isCardCondition, isInventoryAvailability } from '../inventory-labels';

/** Condition and availability chips of an inventory item (offers left the web, decision 2). */
@Component({
  selector: 'app-item-chips',
  imports: [AvailabilityChipComponent, ConditionChipComponent],
  template: `
    <span class="chips">
      @if (knownCondition(); as known) {
        <app-condition-chip [condition]="known" />
      } @else {
        <span class="chips__raw" [attr.aria-label]="'Condition: ' + conditionText()">{{
          conditionText()
        }}</span>
      }
      @if (knownAvailability(); as availability) {
        <app-availability-chip [availability]="availability" />
      }
    </span>
  `,
  styles: `
    :host {
      display: block;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .chips__raw {
      padding: 1px var(--spacing-2);
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border-strong);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemChipsComponent {
  readonly condition = input<string | null | undefined>(null);
  readonly availability = input<string | null | undefined>(null);

  protected readonly knownCondition = computed(() => {
    const value = this.condition();
    return isCardCondition(value) ? value : null;
  });
  protected readonly conditionText = computed(() => conditionLabel(this.condition()));
  protected readonly knownAvailability = computed(() => {
    const value = this.availability();
    return isInventoryAvailability(value) ? value : null;
  });
}
