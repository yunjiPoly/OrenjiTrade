import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { BinderResponse, InventoryItemResponse } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { isLimitReached, limitReachedInfo } from '../../../core/limits/limit-reached';
import { GamesStore } from '../../../shared/catalog/games.store';
import { ALL_GAMES, gameInfo } from '../../../shared/domain/games';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import {
  BINDER_COPY,
  BinderFormErrors,
  BinderFormValue,
  BinderVisibilityChoice,
  binderFormOf,
  hasBinderErrors,
  toCreateBinderBody,
  validateBinderForm,
  withDeckCore,
} from '../data/binder-form';
import { gameOpenForBinders } from '../data/binder-games';
import { binderGameError } from '../data/inventory-actions.service';
import { InventoryStore } from '../data/inventory.store';

export interface NewBinderData {
  /** "Cards inside": the selection the binder is made from. */
  selection?: readonly InventoryItemResponse[];
  /** The game chosen first (the selection's, else the pane's). */
  game?: string | null;
}

export interface NewBinderResult {
  binder: BinderResponse;
  /** "Sell as a deck core" was on: Edit binder opens on the deck core fields. */
  deckCore: boolean;
  /** The selection's cards moved in (those of the binder's game). */
  moved: number;
}

const VISIBILITIES: readonly SegmentOption<BinderVisibilityChoice>[] = [
  { value: 'PRIVATE', label: 'Private', icon: 'lock' },
  { value: 'PUBLIC', label: 'Public', icon: 'public' },
];

/**
 * New binder (spec 9.12, 520): the name, five game tiles (single choice; a game without cards is
 * dimmed "Cards coming soon"), "A binder holds cards of one game. You can't change it once it has
 * cards.", [Private | Public], the purple "Sell as a deck core" switch (Create then opens Edit
 * binder on the deck core fields), the selection's "Cards inside", and [Create binder]. The stage
 * G 409s and the binder limit answer in plain words.
 */
@Component({
  selector: 'app-new-binder-dialog',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatSlideToggleModule,
    GameMonogramComponent,
    SegmentedComponent,
  ],
  template: `
    <h2 mat-dialog-title id="new-binder-title">New binder</h2>
    <mat-dialog-content class="nb">
      <label class="field">
        <span class="label">Name</span>
        <input
          #name
          class="input"
          maxlength="80"
          placeholder="Trade binder"
          [value]="form().name"
          [attr.aria-invalid]="!!errors().name"
          (input)="change({ name: $any($event.target).value })"
          (keydown.enter)="create()"
          data-testid="new-binder-name"
        />
        @if (errors().name; as error) {
          <span class="error" role="alert">{{ error }}</span>
        }
      </label>

      <div class="field">
        <span class="label" id="nb-game">Game</span>
        <div class="tiles" role="radiogroup" aria-labelledby="nb-game">
          @for (tile of tiles(); track tile.slug) {
            <button
              type="button"
              role="radio"
              class="tile"
              [class.tile--on]="form().game === tile.slug"
              [attr.aria-checked]="form().game === tile.slug"
              [attr.aria-disabled]="!tile.open"
              [attr.aria-describedby]="tile.open ? null : 'nb-soon-' + tile.slug"
              [tabindex]="form().game === tile.slug ? 0 : -1"
              (click)="chooseGame(tile.slug, tile.open)"
              (keydown)="onTileKey($event)"
              [attr.data-testid]="'new-binder-game-' + tile.slug"
            >
              <app-game-monogram [game]="tile.slug" size="24" />
              <span class="tile__name">{{ tile.label }}</span>
              @if (!tile.open) {
                <span class="tile__soon" [id]="'nb-soon-' + tile.slug">{{ copy.gameComingSoon }}</span>
              }
            </button>
          }
        </div>
        <p class="hint">{{ copy.gameHint }}</p>
      </div>

      <div class="field">
        <span class="label">Who can see it</span>
        <app-segmented
          block
          size="lg"
          label="Who can see it"
          [options]="visibilities"
          [value]="form().visibility"
          (valueChange)="change({ visibility: $event })"
        />
      </div>

      <div class="core" [class.core--on]="form().sellsAsCore">
        <span class="core__icon" aria-hidden="true"><mat-icon>layers</mat-icon></span>
        <span class="core__titles">
          <span class="core__title" id="nb-core">{{ copy.coreTitle }}</span>
          <span class="core__hint">{{ copy.coreHint }}</span>
        </span>
        <mat-slide-toggle
          class="core__switch"
          aria-labelledby="nb-core"
          [checked]="form().sellsAsCore"
          (change)="form.set(withCore($event.checked))"
        />
      </div>

      @if (selectionCount() > 0) {
        <p class="inside" data-testid="new-binder-inside">
          <mat-icon aria-hidden="true">style</mat-icon>
          <span>
            <strong>Cards inside:</strong> {{ insideLine() }} Cards in another binder move here.
            @if (otherGameCount() > 0) {
              {{ otherGameLine() }}
            }
          </span>
        </p>
      }

      @if (error(); as message) {
        <p class="error error--block" role="alert" data-testid="new-binder-error">{{ message }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions class="actions">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button
        matButton="filled"
        type="button"
        class="create"
        [disabled]="saving()"
        (click)="create()"
        data-testid="new-binder-create"
      >
        {{ saving() ? 'Creating…' : 'Create binder' }}
      </button>
    </mat-dialog-actions>
  `,
  styleUrl: './new-binder-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewBinderDialogComponent {
  private readonly ref = inject<MatDialogRef<NewBinderDialogComponent, NewBinderResult>>(MatDialogRef);
  private readonly data = inject<NewBinderData>(MAT_DIALOG_DATA, { optional: true }) ?? {};
  private readonly store = inject(InventoryStore);
  private readonly games = inject(GamesStore);
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('name');

  protected readonly copy = BINDER_COPY;
  protected readonly visibilities = VISIBILITIES;
  protected readonly form = signal<BinderFormValue>(
    binderFormOf(null, Date.now(), this.data.game ?? 'yugioh'),
  );
  protected readonly errors = signal<BinderFormErrors>({});
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  /** The five games of the phone (stage G), each open when it has cards. */
  protected readonly tiles = computed(() => {
    const loaded = this.games.games();
    return ALL_GAMES.map((game) => {
      const response = loaded?.find((candidate) => candidate.slug === game.slug);
      return {
        slug: game.slug,
        label: game.shortLabel,
        open: response ? gameOpenForBinders(response) : game.slug === 'yugioh',
      };
    });
  });
  private readonly selection = computed(() => this.data.selection ?? []);
  protected readonly selectionCount = computed(() => this.selection().length);
  private readonly sameGame = computed(() =>
    this.selection().filter((item) => item.card.game === this.form().game),
  );
  protected readonly otherGameCount = computed(
    () => this.selectionCount() - this.sameGame().length,
  );
  protected readonly insideLine = computed(() => {
    const count = this.sameGame().length;
    const game = gameInfo(this.form().game).label;
    return `${count} ${game} ${count === 1 ? 'card' : 'cards'} from your selection.`;
  });
  protected readonly otherGameLine = computed(() => {
    const count = this.otherGameCount();
    return `${count} ${count === 1 ? 'card' : 'cards'} of another game stay where ${count === 1 ? 'it is' : 'they are'}.`;
  });

  constructor() {
    void this.games.load();
    afterNextRender(() => this.nameField()?.nativeElement.focus());
  }

  protected withCore(on: boolean): BinderFormValue {
    return withDeckCore(this.form(), on);
  }

  protected change(change: Partial<BinderFormValue>): void {
    this.form.update((value) => ({ ...value, ...change }));
    this.error.set(null);
    if (Object.keys(this.errors()).length) {
      this.errors.set(validateBinderForm(this.form()));
    }
  }

  protected chooseGame(slug: string, open: boolean): void {
    if (open) {
      this.change({ game: slug });
    }
  }

  protected onTileKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const open = this.tiles().filter((tile) => tile.open);
    const at = open.findIndex((tile) => tile.slug === this.form().game);
    const next = open[(at + step + open.length) % open.length];
    if (next) {
      this.change({ game: next.slug });
      setTimeout(() =>
        document.querySelector<HTMLElement>(`[data-testid="new-binder-game-${next.slug}"]`)?.focus(),
      );
    }
  }

  protected async create(): Promise<void> {
    const errors = validateBinderForm(this.form());
    this.errors.set(errors);
    if (hasBinderErrors(errors)) {
      return;
    }
    await this.games.load();
    const gameId = this.games.game(this.form().game)?.id;
    if (!gameId) {
      this.error.set('The games could not load. Try again.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const binder = await this.store.createBinder(toCreateBinderBody(this.form(), gameId), {
        explainLimit: true,
      });
      let moved = 0;
      const ids = this.sameGame().map((item) => item.id);
      if (ids.length) {
        const response = await this.store.bulk(
          { kind: 'move', binderId: binder.id, binderName: binder.name, binderGame: binder.game },
          ids,
        );
        moved = response.updated;
      }
      this.store.loadBinders();
      this.ref.close({ binder, deckCore: this.form().sellsAsCore, moved });
    } catch (error) {
      const apiError = error as ApiError;
      if (isLimitReached(apiError)) {
        const info = limitReachedInfo(apiError);
        this.error.set(BINDER_COPY.limit(info.limit ?? (this.store.binders()?.length ?? 0)));
      } else {
        this.error.set(
          binderGameError(apiError, gameInfo(this.form().game).label) ??
            friendlyError(apiError).message,
        );
      }
    } finally {
      this.saving.set(false);
    }
  }
}
