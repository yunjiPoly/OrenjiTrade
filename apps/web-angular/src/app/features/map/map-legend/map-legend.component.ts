import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { APPROXIMATE_LOCATION_NOTE } from '../../../shared/map/approximate-area';

/**
 * Map legend: why locations are approximate (and how approximate: the 3 km zones), and what the
 * marker rings mean.
 */
@Component({
  selector: 'app-map-legend',
  imports: [MatButtonModule, MatIconModule],
  template: `
    <aside class="legend" aria-label="Map legend">
      <p class="legend__privacy" data-testid="map-approximate-note">
        <mat-icon aria-hidden="true">shield_person</mat-icon>
        {{ note }} to protect privacy
      </p>
      @if (expanded()) {
        <ul class="legend__keys" id="map-legend-keys">
          <li>
            <span class="legend__area" aria-hidden="true"></span>Approximate area of a collector
          </li>
          <li>
            <span class="legend__ring legend__ring--fresh" aria-hidden="true"></span>Fresh listings
          </li>
          <li>
            <span class="legend__ring legend__ring--aging" aria-hidden="true"></span>Aging listings
          </li>
          <li><span class="legend__ring" aria-hidden="true"></span>No public listings yet</li>
          <li>
            <span class="legend__cluster" aria-hidden="true">12</span>Several collectors: zoom in
          </li>
        </ul>
      }
      <button
        matButton
        type="button"
        class="legend__toggle"
        aria-controls="map-legend-keys"
        [attr.aria-expanded]="expanded()"
        (click)="expanded.set(!expanded())"
      >
        {{ expanded() ? 'Hide legend' : 'Legend' }}
      </button>
    </aside>
  `,
  styles: `
    :host {
      display: block;
    }
    .legend {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-1);
      max-width: 280px;
      padding: var(--spacing-2) var(--spacing-3);
      border-radius: var(--radius-md);
      background: color-mix(in srgb, var(--color-surface) 92%, transparent);
      box-shadow: var(--elevation-menu);
      font-size: var(--font-size-xs);
      backdrop-filter: blur(6px);
    }
    .legend__privacy {
      display: flex;
      align-items: center;
      gap: var(--spacing-1);
      margin: 0;
      font-weight: var(--font-weight-medium);
      color: var(--color-ink);
    }
    .legend__privacy mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
      color: var(--color-accent);
    }
    .legend__keys {
      display: grid;
      gap: 4px;
      margin: var(--spacing-1) 0 0;
      padding: 0;
      list-style: none;
      color: var(--color-text-muted);
    }
    .legend__keys li {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
    }
    .legend__ring {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-surface);
      box-shadow: 0 0 0 3px var(--color-border-strong);
    }
    .legend__ring--fresh {
      box-shadow: 0 0 0 3px var(--color-status-fresh);
    }
    .legend__ring--aging {
      box-shadow: 0 0 0 3px var(--color-status-aging);
    }
    .legend__area {
      box-sizing: border-box;
      width: 20px;
      height: 20px;
      border: 1px solid color-mix(in srgb, var(--color-primary) 50%, transparent);
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    }
    .legend__cluster {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--color-primary);
      color: var(--color-on-primary);
      font-size: 10px;
      font-weight: var(--font-weight-bold);
    }
    .legend__toggle {
      align-self: flex-start;
      --mat-button-text-container-height: 28px;
      margin-left: calc(var(--spacing-3) * -1);
      font-size: var(--font-size-xs);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLegendComponent {
  protected readonly note = APPROXIMATE_LOCATION_NOTE;
  protected readonly expanded = signal(false);
}
