import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** What "Add many at once" opens. */
export type AddManyChoice = 'quick' | 'ydk' | 'csv';

/**
 * "Add many at once" of the Add cards drawer (spec 9.9): Quick add rows, Import a deck, Import
 * from Collectr. No camera scan on the web (ML hold).
 */
@Component({
  selector: 'app-add-many',
  imports: [MatIconModule],
  template: `
    <section class="many" aria-labelledby="add-many">
      <h3 id="add-many" class="label">Add many at once</h3>
      <button type="button" class="many__row" (click)="choose.emit('quick')">
        <mat-icon aria-hidden="true">playlist_add</mat-icon>
        <span class="many__text">
          <span class="many__title">Quick add rows</span>
          <span class="many__body">Type codes one after another, right in the table</span>
        </span>
        <kbd aria-hidden="true">Shift+N</kbd>
      </button>
      <button type="button" class="many__row" (click)="choose.emit('ydk')">
        <mat-icon aria-hidden="true">description</mat-icon>
        <span class="many__text">
          <span class="many__title">Import a deck</span>
          <span class="many__body">.ydk file from YGOPRODeck or EDOPro</span>
        </span>
      </button>
      <button type="button" class="many__row" (click)="choose.emit('csv')">
        <mat-icon aria-hidden="true">table_view</mat-icon>
        <span class="many__text">
          <span class="many__title">Import from Collectr</span>
          <span class="many__body">.csv export. You check every match before it's added</span>
        </span>
      </button>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .label {
      margin: 20px 0 8px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    kbd {
      padding: 1px 6px;
      border: 1px solid var(--color-border-strong);
      border-radius: 5px;
      color: var(--color-text-secondary);
      font-family: var(--font-mono);
      font-size: var(--font-size-tag);
    }
    .many__row:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }
    .many {
      margin-top: 8px;
      padding-top: 4px;
      border-top: 1px solid var(--color-border);
    }

    .many__row {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      margin-bottom: 8px;
      padding: 12px;
      border: 1px solid var(--color-border);
      border-radius: 12px;
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }

    .many__row:hover {
      background: var(--color-surface-variant);
    }

    .back:focus-visible,
    .chip:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: 2px;
    }

    .many__row mat-icon {
      color: var(--color-text-secondary);
    }

    .many__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
    }

    .many__title {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }

    .many__body {
      color: var(--color-text-muted);
      font-size: var(--font-size-meta);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddManyComponent {
  readonly choose = output<AddManyChoice>();
}
