import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type WordmarkSize = 'sm' | 'md' | 'lg';

/**
 * Temporary text wordmark: "Orenji" in the brand orange + "Trade" in ink, display font.
 * Renders as a link to the map unless `link` is false.
 */
@Component({
  selector: 'app-wordmark',
  imports: [RouterLink],
  template: `
    @if (link()) {
      <a class="wordmark" routerLink="/map" aria-label="OrenjiTrade home">
        <span class="wordmark__orenji">Orenji</span><span class="wordmark__trade">Trade</span>
      </a>
    } @else {
      <span class="wordmark" aria-label="OrenjiTrade">
        <span class="wordmark__orenji">Orenji</span><span class="wordmark__trade">Trade</span>
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      --wordmark-size: var(--font-size-xl);
    }
    :host([size='sm']) {
      --wordmark-size: var(--font-size-md);
    }
    :host([size='lg']) {
      --wordmark-size: var(--font-size-3xl);
    }
    .wordmark {
      display: inline-flex;
      align-items: baseline;
      font-family: var(--font-display);
      font-size: var(--wordmark-size);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.02em;
      line-height: 1;
      text-decoration: none;
      white-space: nowrap;
      border-radius: var(--radius-sm);
    }
    .wordmark__orenji {
      color: var(--color-primary);
    }
    .wordmark__trade {
      color: var(--color-ink);
    }
  `,
  host: { '[attr.size]': 'size()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WordmarkComponent {
  readonly link = input(true, { transform: booleanAttribute });
  readonly size = input<WordmarkSize>('md');
}
