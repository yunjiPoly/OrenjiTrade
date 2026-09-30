import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CARD_CONDITIONS, CardCondition } from './card-condition';

/** Card condition as a compact chip (M / NM / LP / MP / HP / DMG) with the full label as tooltip. */
@Component({
  selector: 'app-condition-chip',
  imports: [MatTooltipModule],
  template: `
    <span
      class="chip"
      [class]="'chip chip--' + condition().toLowerCase()"
      [matTooltip]="info().label"
      [attr.aria-label]="'Condition: ' + info().label"
      tabindex="0"
    >
      {{ info().abbreviation }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 2.25rem;
      padding: 1px var(--spacing-2);
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border-strong);
      background: var(--color-surface-variant);
      color: var(--color-ink);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      line-height: 1.6;
      letter-spacing: 0.02em;
      cursor: default;
    }
    .chip--mint,
    .chip--near_mint {
      border-color: var(--color-status-fresh);
    }
    .chip--heavily_played,
    .chip--damaged {
      border-color: var(--color-status-stale);
      color: var(--color-status-stale);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConditionChipComponent {
  readonly condition = input.required<CardCondition>();
  protected readonly info = computed(() => CARD_CONDITIONS[this.condition()]);
}
