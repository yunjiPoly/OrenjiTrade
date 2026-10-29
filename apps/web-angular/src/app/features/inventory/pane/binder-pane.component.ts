import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type { BinderResponse } from '@orenji/api-client';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  BinderGameGroup,
  binderCountLabel,
  binderGame,
  groupBindersByGame,
  onlyGameLabel,
} from '../data/binder-games';
import { binderEnds } from '../data/binder-form';
import { UNFILED } from '../data/inventory-params';
import { BinderCoverComponent } from '../ui/binder-cover.component';

/** What is being dragged from the list: the cards' games and how many there are. */
export interface CardDrag {
  games: readonly string[];
  count: number;
  /** The drop target under the pointer: a binder id, {@link UNFILED}, or null. */
  over: string | null;
}

/** A binder row's menu action. */
export type BinderPaneAction =
  | { kind: 'edit'; binder: BinderResponse }
  | { kind: 'visibility'; binder: BinderResponse }
  | { kind: 'move'; binder: BinderResponse; offset: -1 | 1 }
  | { kind: 'delete'; binder: BinderResponse };

/**
 * The binder pane of Inventory (spec 9.2, 256 wide at lg and xl): "All cards" and "Unfiled", then
 * one section per game with its binders (a 24 px cover, the name, a lock or a globe, the count and
 * the deck core tag), and "New binder". Each binder row has a "⋯" menu (also on right-click): Edit
 * binder, Make public or private, Move up, Move down, Delete binder. Binders are reordered by drag
 * within their game, or with Move up and Move down. While cards are dragged from the list, the
 * binders of their game are drop targets (spec 9.7); the others dim with "Only … cards can go in".
 */
@Component({
  selector: 'app-binder-pane',
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    BinderCoverComponent,
    GameMonogramComponent,
    SkeletonComponent,
  ],
  template: `
    <nav class="bp" aria-label="Binders" [class.bp--dragging]="!!drag()">
      <ul class="bp__fixed" role="list">
        <li>
          <a
            class="bp__row"
            [class.bp__row--on]="selected() === null"
            [routerLink]="[]"
            [queryParams]="{ binder: null, tab: null, item: null }"
            queryParamsHandling="merge"
            [attr.aria-current]="selected() === null ? 'page' : null"
            data-testid="pane-all"
          >
            <mat-icon class="bp__icon" aria-hidden="true">style</mat-icon>
            <span class="bp__name">All cards</span>
            <span class="bp__count">{{ totalItems() ?? '' }}</span>
          </a>
        </li>
        <li>
          <a
            class="bp__row"
            [class.bp__row--on]="selected() === unfiled"
            [class.bp__row--target]="!!drag()"
            [class.bp__row--over]="drag()?.over === unfiled"
            [routerLink]="[]"
            [queryParams]="{ binder: unfiled, tab: null, item: null }"
            queryParamsHandling="merge"
            [attr.aria-current]="selected() === unfiled ? 'page' : null"
            [attr.data-drop-target]="unfiled"
            data-testid="pane-unfiled"
          >
            <mat-icon class="bp__icon" aria-hidden="true">inbox</mat-icon>
            <span class="bp__name">
              Unfiled
              @if (drag()?.over === unfiled) {
                <span class="bp__drop">{{ dropLabel() }}</span>
              }
            </span>
            <span class="bp__count">{{ unfiledCount() ?? '' }}</span>
          </a>
        </li>
      </ul>

      @if (error()) {
        <div class="bp__error" role="alert">
          <p>Your binders could not load.</p>
          <button matButton type="button" (click)="retry.emit()">Try again</button>
        </div>
      } @else if (binders() === null) {
        <div class="bp__loading" aria-busy="true">
          <span class="visually-hidden">Loading your binders</span>
          @for (slot of [1, 2, 3]; track slot) {
            <app-skeleton height="40px" />
          }
        </div>
      } @else {
        @for (group of groups(); track group.game) {
          <section class="bp__game" [attr.aria-labelledby]="'bp-game-' + group.game">
            <h2 class="bp__head" [id]="'bp-game-' + group.game">
              <app-game-monogram [game]="group.game" size="22" />
              <span class="bp__label">{{ group.info.label }}</span>
              <span class="bp__sum">{{ countLabel(group.binders.length) }}</span>
            </h2>
            <ul
              class="bp__list"
              role="list"
              cdkDropList
              cdkDropListLockAxis="y"
              [cdkDropListData]="group"
              [cdkDropListDisabled]="!!drag() || group.binders.length < 2"
              (cdkDropListDropped)="onReorder(group, $event)"
            >
              @for (
                binder of group.binders;
                track binder.id;
                let first = $first;
                let last = $last
              ) {
                <li class="bp__item" cdkDrag [cdkDragData]="binder">
                  <div class="bp__placeholder" *cdkDragPlaceholder></div>
                  <a
                    class="bp__row"
                    [class.bp__row--on]="selected() === binder.id"
                    [class.bp__row--target]="targetable(binder)"
                    [class.bp__row--over]="drag()?.over === binder.id && targetable(binder)"
                    [class.bp__row--dim]="!!drag() && !targetable(binder)"
                    [routerLink]="[]"
                    [queryParams]="{ binder: binder.id, tab: null, item: null }"
                    queryParamsHandling="merge"
                    [attr.aria-current]="selected() === binder.id ? 'page' : null"
                    [attr.aria-label]="rowLabel(binder)"
                    [attr.data-drop-target]="binder.id"
                    [attr.data-testid]="'pane-binder-' + binder.id"
                    (contextmenu)="openMenu($event, trigger)"
                  >
                    <app-binder-cover [binder]="binder" />
                    <span class="bp__text">
                      <span class="bp__name">{{ binder.name }}</span>
                      @if (binder.sellsAsCore) {
                        <span class="bp__core">{{ coreTag(binder) }}</span>
                      }
                      @if (ends(binder); as e) {
                        <span class="bp__ends">Public · {{ e }}</span>
                      }
                      @if (drag()?.over === binder.id && targetable(binder)) {
                        <span class="bp__drop">{{ dropLabel() }}</span>
                      }
                    </span>
                    <mat-icon class="bp__vis" aria-hidden="true">{{
                      binder.visibility === 'PRIVATE' ? 'lock' : 'public'
                    }}</mat-icon>
                    <span class="bp__count">{{ binder.itemCount }}</span>
                  </a>
                  @if (!!drag() && !targetable(binder) && drag()?.over === binder.id) {
                    <span class="bp__tip" role="tooltip">{{ onlyLabel(binder) }}</span>
                  }
                  <button
                    matIconButton
                    type="button"
                    class="bp__more"
                    #trigger="matMenuTrigger"
                    [matMenuTriggerFor]="menu"
                    [matMenuTriggerData]="{ binder: binder, first: first, last: last }"
                    [attr.aria-label]="'More for ' + binder.name"
                    [attr.data-binder-more]="binder.id"
                    [attr.data-testid]="'pane-more-' + binder.id"
                  >
                    <mat-icon>more_horiz</mat-icon>
                  </button>
                </li>
              }
            </ul>
          </section>
        }
      }

      <button type="button" class="bp__new" (click)="newBinder.emit()" data-testid="pane-new">
        <mat-icon aria-hidden="true">add</mat-icon>
        New binder
      </button>
    </nav>

    <mat-menu #menu="matMenu">
      <ng-template matMenuContent let-binder="binder" let-first="first" let-last="last">
        <button mat-menu-item type="button" (click)="act.emit({ kind: 'edit', binder })">
          <mat-icon>edit</mat-icon>
          <span>Edit binder</span>
        </button>
        <button mat-menu-item type="button" (click)="act.emit({ kind: 'visibility', binder })">
          <mat-icon>{{ binder.visibility === 'PRIVATE' ? 'public' : 'lock' }}</mat-icon>
          <span>{{ binder.visibility === 'PRIVATE' ? 'Make public' : 'Make private' }}</span>
        </button>
        @if (binder.effectivePublic) {
          <a mat-menu-item [routerLink]="['/binders', binder.id]">
            <mat-icon>open_in_new</mat-icon>
            <span>View public page</span>
          </a>
        }
        <button
          mat-menu-item
          type="button"
          [disabled]="first"
          (click)="act.emit({ kind: 'move', binder, offset: -1 })"
        >
          <mat-icon>arrow_upward</mat-icon>
          <span>Move up</span>
        </button>
        <button
          mat-menu-item
          type="button"
          [disabled]="last"
          (click)="act.emit({ kind: 'move', binder, offset: 1 })"
        >
          <mat-icon>arrow_downward</mat-icon>
          <span>Move down</span>
        </button>
        <button
          mat-menu-item
          type="button"
          class="bp__danger"
          (click)="act.emit({ kind: 'delete', binder })"
        >
          <mat-icon>delete</mat-icon>
          <span>Delete binder</span>
        </button>
      </ng-template>
    </mat-menu>
  `,
  styles: `
    :host {
      display: block;
    }
    .bp {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-4);
      padding: 24px 12px 24px 12px;
    }
    .bp__fixed,
    .bp__list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .bp__item {
      position: relative;
    }
    .bp__row {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 40px;
      padding: 6px 10px;
      border: 1px solid transparent;
      border-radius: 10px;
      color: var(--color-ink);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      text-decoration: none;
      transition: opacity var(--motion-duration-fast);
    }
    .bp__row:hover {
      background: var(--color-surface-variant);
    }
    .bp__row--on {
      background: var(--color-surface-variant);
      font-weight: var(--font-weight-semibold);
    }
    .bp__row:focus-visible {
      outline: var(--focus-width) solid var(--color-focus-ring);
      outline-offset: -2px;
    }
    .bp__item .bp__row {
      padding-right: 10px;
    }
    .bp__icon {
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--color-text-muted);
    }
    .bp__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .bp__name {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bp__ends {
      color: var(--color-text-muted);
      font-size: var(--font-size-tag);
    }
    .bp__core {
      align-self: flex-start;
      padding: 1px 6px;
      border-radius: 5px;
      background: var(--color-deck-core-tag-background);
      color: var(--color-deck-core-tag-text);
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
    }
    .bp__vis {
      width: 14px;
      height: 14px;
      font-size: 14px;
      color: var(--color-text-muted);
    }
    /* Own counts: muted text that passes AA on the pane and on the chosen row (WA review R1-5). */
    .bp__count {
      min-width: 20px;
      color: var(--color-text-secondary);
      font-size: var(--font-size-meta);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .bp__item:hover .bp__count,
    .bp__item:focus-within .bp__count,
    .bp__item:hover .bp__vis,
    .bp__item:focus-within .bp__vis {
      visibility: hidden;
    }
    .bp__more {
      position: absolute;
      top: 50%;
      right: 2px;
      width: 36px;
      height: 36px;
      padding: 6px;
      transform: translateY(-50%);
      opacity: 0;
    }
    .bp__item:hover .bp__more,
    .bp__item:focus-within .bp__more,
    .bp__more[aria-expanded='true'] {
      opacity: 1;
    }
    .bp__head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 6px;
      padding: 0 10px;
      font-size: var(--font-size-tag);
      font-weight: var(--font-weight-semibold);
    }
    .bp__label {
      flex: 1 1 auto;
      color: var(--color-text-secondary);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .bp__sum {
      color: var(--color-text-secondary);
      font-weight: var(--font-weight-medium);
    }
    .bp__new {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 40px;
      border: 1px dashed var(--app-primary-text);
      border-radius: 10px;
      background: transparent;
      color: var(--app-primary-text);
      font: inherit;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
    }
    .bp__new:hover {
      background: var(--color-primary-tint-subtle);
    }
    .bp__new mat-icon {
      width: 18px;
      height: 18px;
      font-size: 18px;
    }
    .bp__error {
      padding: 0 10px;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .bp__loading {
      display: grid;
      gap: 6px;
      padding: 0 6px;
    }
    /* Dragging cards (spec 9.7). */
    .bp__row--target {
      border: 1px dashed var(--app-primary-text);
    }
    .bp__row--over {
      border-style: solid;
      background: var(--color-primary-tint);
    }
    .bp__row--dim {
      opacity: 0.4;
    }
    .bp__drop {
      color: var(--app-primary-text);
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
    }
    .bp__tip {
      position: absolute;
      top: calc(100% + 4px);
      left: 10px;
      z-index: 2;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--color-ink);
      color: var(--color-background);
      font-size: var(--font-size-meta);
      font-weight: var(--font-weight-semibold);
      white-space: nowrap;
    }
    .bp__placeholder {
      min-height: 40px;
      border: 1px dashed var(--color-border-strong);
      border-radius: 10px;
    }
    .cdk-drag-preview {
      border-radius: 10px;
      background: var(--color-surface-elevated);
      box-shadow: var(--elevation-menu);
    }
    .bp__danger {
      color: var(--color-danger);
    }
    @media (prefers-reduced-motion: reduce) {
      .bp__row {
        transition: none;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderPaneComponent {
  readonly binders = input<BinderResponse[] | null>(null);
  /** The binder in the URL, {@link UNFILED}, or null for All cards. */
  readonly selected = input<string | null>(null);
  readonly totalItems = input<number | null>(null);
  readonly unfiledCount = input<number | null>(null);
  readonly error = input(false, { transform: booleanAttribute });
  readonly drag = input<CardDrag | null>(null);

  readonly newBinder = output<void>();
  readonly retry = output<void>();
  readonly act = output<BinderPaneAction>();
  /** A binder dropped in a new place within its game: the full new order. */
  readonly reorder = output<{ binder: BinderResponse; offset: number }>();

  protected readonly unfiled = UNFILED;
  protected readonly groups = computed(() => groupBindersByGame(this.binders() ?? []));
  protected readonly dropLabel = computed(() => {
    const count = this.drag()?.count ?? 0;
    return `Move ${count} ${count === 1 ? 'card' : 'cards'} here`;
  });

  protected countLabel(count: number): string {
    return binderCountLabel(count);
  }

  protected coreTag(binder: BinderResponse): string {
    const price = binder.askingPriceText?.trim();
    return price ? `Deck core · ${price}` : 'Deck core';
  }

  protected rowLabel(binder: BinderResponse): string {
    const who = binder.visibility === 'PRIVATE' ? 'private' : 'public';
    const ends = this.ends(binder);
    const core = binder.sellsAsCore ? ', deck core' : '';
    return `${binder.name}, ${who}${ends ? ` (${ends})` : ''}${core}, ${binder.itemCount} ${binder.itemCount === 1 ? 'card' : 'cards'}`;
  }

  /** "ends tomorrow" for a running temporary publication (U9). */
  protected ends(binder: BinderResponse): string | null {
    return binderEnds(binder);
  }

  /** A binder takes the dragged cards when all of them are of its game. */
  protected targetable(binder: BinderResponse): boolean {
    const drag = this.drag();
    if (!drag) {
      return false;
    }
    const game = binderGame(binder);
    return !game || drag.games.every((candidate) => candidate === game);
  }

  protected onlyLabel(binder: BinderResponse): string {
    return onlyGameLabel(binderGame(binder));
  }

  protected openMenu(event: MouseEvent, trigger: MatMenuTrigger): void {
    event.preventDefault();
    trigger.openMenu();
  }

  protected onReorder(group: BinderGameGroup, event: CdkDragDrop<BinderGameGroup>): void {
    const offset = event.currentIndex - event.previousIndex;
    const binder = group.binders[event.previousIndex];
    if (binder && offset !== 0) {
      this.reorder.emit({ binder, offset });
    }
  }
}
