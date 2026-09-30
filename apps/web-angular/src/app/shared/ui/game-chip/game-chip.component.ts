import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { gameInfo } from '../../domain/games';

/** Pill showing a game with its accent colour dot. */
@Component({
  selector: 'app-game-chip',
  template: `
    <span class="chip" [style.--chip-accent]="accent()">
      <span class="chip__dot" aria-hidden="true"></span>
      {{ info().label }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: 4px var(--spacing-3);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--chip-accent) 12%, var(--color-surface));
      border: 1px solid color-mix(in srgb, var(--chip-accent) 35%, transparent);
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
    }
    .chip__dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--chip-accent);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameChipComponent {
  readonly slug = input.required<string>();
  protected readonly info = computed(() => gameInfo(this.slug()));
  protected readonly accent = computed(() => `var(${this.info().colorVar})`);
}
