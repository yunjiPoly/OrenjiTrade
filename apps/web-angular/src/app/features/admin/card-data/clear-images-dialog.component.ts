import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { mbText } from './card-data';

export interface ClearImagesDialogData {
  games: { slug: string; name: string; cached: number; mb: number }[];
  totalMb: number;
}

/**
 * Board A12's "Clear a game's card images?": one game at a time (`POST /admin/card-images/clear`
 * with a game; destructive, confirmed). Closes with the game's slug, or nothing.
 */
@Component({
  selector: 'app-clear-images-dialog',
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>Clear a game’s card images?</h2>
    <form (submit)="$event.preventDefault(); confirm()" novalidate>
      <mat-dialog-content>
        <label class="cid__field">
          <span class="cid__label">Images to clear</span>
          <select
            class="cid__select"
            [value]="game()"
            [attr.aria-invalid]="tried() && !game() ? 'true' : null"
            aria-describedby="cid-help"
            (change)="pick($event)"
          >
            <option value="">Choose a game</option>
            @for (g of data.games; track g.slug) {
              <option [value]="g.slug">
                {{ g.name }} · {{ g.cached.toLocaleString('en-US') }} images, {{ mbText(g.mb) }} MB
              </option>
            }
          </select>
        </label>
        <p class="cid__help" id="cid-help" [class.cid__help--bad]="tried() && !game()">
          {{ tried() && !game() ? 'Choose the game whose images to clear.' : chosenLine() }}
        </p>
        <p class="cid__text">
          Collectors see the placeholder until the images are fetched again. Card data stays.
        </p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button type="button" class="cid__button" mat-dialog-close>Cancel</button>
        <button type="submit" class="cid__button cid__button--danger">Clear images</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .cid__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .cid__label {
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
    }
    .cid__select {
      height: 44px;
      padding: 0 12px;
      border: 1px solid var(--color-border-input);
      border-radius: 12px;
      background: var(--color-surface);
      color: var(--color-ink);
      font: inherit;
    }
    .cid__select[aria-invalid='true'] {
      border-color: var(--color-danger);
    }
    .cid__select:focus-visible,
    .cid__button:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: var(--focus-offset);
    }
    .cid__help {
      margin: 6px 0 0;
      color: var(--color-text-secondary);
      font-size: var(--font-size-xs);
    }
    .cid__help--bad {
      color: var(--app-danger-text);
      font-weight: var(--font-weight-semibold);
    }
    .cid__text {
      margin: 14px 0 0;
      color: var(--color-text-secondary);
    }
    .cid__button {
      height: 40px;
      padding: 0 16px;
      border: 1px solid var(--color-border-strong);
      border-radius: var(--radius-pill);
      background: none;
      color: var(--color-ink);
      font: inherit;
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .cid__button--danger {
      border-color: transparent;
      background: var(--color-danger-fill);
      color: #fff;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClearImagesDialogComponent {
  protected readonly data = inject<ClearImagesDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ClearImagesDialogComponent, string>);
  protected readonly game = signal('');
  protected readonly tried = signal(false);
  protected readonly mbText = mbText;
  protected readonly chosenLine = computed(() => {
    const game = this.data.games.find((g) => g.slug === this.game());
    return game
      ? `${game.cached.toLocaleString('en-US')} cached images of ${game.name}, ${mbText(game.mb)} MB.`
      : 'One game at a time.';
  });

  protected pick(event: Event): void {
    this.game.set((event.target as HTMLSelectElement).value);
  }

  protected confirm(): void {
    this.tried.set(true);
    if (this.game()) {
      this.ref.close(this.game());
    }
  }
}
