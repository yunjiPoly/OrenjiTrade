import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { MatchReadiness } from '../data/wishlist.store';

interface Hint {
  icon: string;
  title: string;
  text: string;
  action: string;
  link: string;
}

const HINTS: Partial<Record<MatchReadiness, Hint>> = {
  'no-area': {
    icon: 'location_off',
    title: 'Set your trading area to get matches',
    text: 'Matches are collectors near your approximate trading area. Choose it once (a neighbourhood is enough) and new listings nearby will reach you.',
    action: 'Set trading area',
    link: '/settings/trading-area',
  },
  hidden: {
    icon: 'visibility_off',
    title: 'Show yourself on the map to get matches',
    text: 'Distances are measured between approximate public areas, and yours only exists while you are discoverable. Your exact location is never shown.',
    action: 'Privacy settings',
    link: '/settings/privacy',
  },
};

/**
 * Explains why no match can arrive yet (no trading area, or not discoverable) with a link to the
 * setting that fixes it. Renders nothing when matching works.
 */
@Component({
  selector: 'app-match-readiness',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  template: `
    @if (hint(); as hint) {
      <aside class="mr" role="note" data-testid="match-readiness">
        <mat-icon class="mr__icon" aria-hidden="true">{{ hint.icon }}</mat-icon>
        <div class="mr__text">
          <p class="mr__title">{{ hint.title }}</p>
          <p class="mr__body">{{ hint.text }}</p>
        </div>
        <a matButton="tonal" [routerLink]="hint.link">{{ hint.action }}</a>
      </aside>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .mr {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3) var(--spacing-4);
      margin-bottom: var(--spacing-5);
      padding: var(--spacing-4);
      border: 1px solid color-mix(in srgb, var(--color-warning) 45%, var(--color-border));
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
    }
    .mr__icon {
      flex: 0 0 auto;
      color: var(--color-warning);
    }
    .mr__text {
      flex: 1 1 320px;
      min-width: 0;
    }
    .mr__title {
      margin: 0;
      font-weight: var(--font-weight-semibold);
    }
    .mr__body {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchReadinessComponent {
  readonly readiness = input<MatchReadiness>('unknown');

  protected readonly hint = computed(() => HINTS[this.readiness()] ?? null);
}
