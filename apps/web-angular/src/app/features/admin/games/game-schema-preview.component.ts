import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GameSchema } from '@orenji/api-client';
import { editionLabel, finishLabel, languageLabel } from '../../../shared/catalog/catalog-labels';

/** Read-only view of a `GameSchema`: value lists as chips and the metadata fields as a table. */
@Component({
  selector: 'app-game-schema-preview',
  template: `
    @if (schema(); as schema) {
      <dl class="lists">
        @for (list of lists(); track list.label) {
          <div class="lists__row">
            <dt>{{ list.label }}</dt>
            <dd>
              @for (value of list.values; track value) {
                <span class="chip">{{ value }}</span>
              } @empty {
                <span class="muted">None</span>
              }
            </dd>
          </div>
        }
      </dl>
      <table class="fields" aria-label="Metadata fields">
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Label</th>
            <th scope="col">Type</th>
            <th scope="col">Filter</th>
            <th scope="col">Summary</th>
            <th scope="col">Options</th>
          </tr>
        </thead>
        <tbody>
          @for (field of schema.metadataFields; track field.key) {
            <tr>
              <td class="mono">{{ field.key }}</td>
              <td>{{ field.label }}</td>
              <td class="mono">{{ field.type }}</td>
              <td>{{ field.filterable ? 'Yes' : 'No' }}</td>
              <td>{{ schema.summaryFields.includes(field.key) ? 'Yes' : 'No' }}</td>
              <td class="fields__options">{{ (field.options ?? []).join(', ') || '—' }}</td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="muted">No metadata fields.</td>
            </tr>
          }
        </tbody>
      </table>
    } @else {
      <p class="muted">Fix the schema to see the preview.</p>
    }
  `,
  styles: `
    :host {
      display: block;
      font-size: var(--font-size-sm);
    }
    .lists {
      display: grid;
      gap: var(--spacing-2);
      margin: 0 0 var(--spacing-4);
    }
    .lists__row {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: var(--spacing-2);
    }
    dt {
      color: var(--color-text-muted);
      font-weight: var(--font-weight-semibold);
    }
    dd {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 0;
    }
    .chip {
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: var(--color-surface-variant);
    }
    .fields {
      width: 100%;
      border-collapse: collapse;
    }
    .fields th,
    .fields td {
      padding: var(--spacing-1) var(--spacing-2);
      border-bottom: 1px solid var(--color-border);
      text-align: left;
    }
    .fields th {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .fields__options {
      max-width: 220px;
    }
    .muted {
      color: var(--color-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameSchemaPreviewComponent {
  readonly schema = input<GameSchema | null>(null);

  protected readonly lists = computed(() => {
    const schema = this.schema();
    if (!schema) {
      return [];
    }
    return [
      { label: 'Rarities', values: schema.rarities },
      { label: 'Editions', values: schema.editions.map((value) => editionLabel(value)) },
      { label: 'Languages', values: schema.languages.map((value) => languageLabel(value)) },
      { label: 'Finishes', values: schema.finishes.map((value) => finishLabel(value)) },
      { label: 'Conditions', values: schema.conditions },
    ];
  });
}
