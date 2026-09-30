import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GameMetadataField } from '@orenji/api-client';
import { metadataEntries } from '../../../shared/catalog/catalog-labels';

/**
 * Game-specific card attributes rendered from the game's `GameSchema.metadataFields`: labels,
 * value types (numbers, lists as chips, booleans) and order come from the schema, so a new game
 * or field needs no UI change. Values without a declared field are listed after them.
 */
@Component({
  selector: 'app-card-metadata',
  template: `
    @if (entries().length) {
      <dl class="meta">
        @for (entry of entries(); track entry.key) {
          <div class="meta__item" [attr.data-key]="entry.key">
            <dt class="meta__label">{{ entry.label }}</dt>
            <dd class="meta__value">
              @if (entry.items.length) {
                <span class="meta__chips">
                  @for (item of entry.items; track item) {
                    <span class="meta__chip">{{ item }}</span>
                  }
                </span>
              } @else {
                {{ entry.value }}
              }
            </dd>
          </div>
        }
      </dl>
    } @else {
      <p class="meta__empty">No attributes recorded for this card.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--spacing-3);
      margin: 0;
    }
    .meta__item {
      padding: var(--spacing-3);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .meta__label {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .meta__value {
      margin: 2px 0 0;
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-ink);
    }
    .meta__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .meta__chip {
      padding: 1px var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
      font-size: var(--font-size-sm);
    }
    .meta__empty {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardMetadataComponent {
  readonly fields = input<readonly GameMetadataField[] | null>(null);
  readonly metadata = input<Record<string, unknown> | null | undefined>(null);

  protected readonly entries = computed(() =>
    metadataEntries(this.fields(), this.metadata(), { includeUndeclared: true }),
  );
}
