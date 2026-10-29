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
import { MatMenuModule } from '@angular/material/menu';
import { RouterLink } from '@angular/router';
import type { BinderResponse } from '@orenji/api-client';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { BINDER_COPY, binderLine, deckCoreTag } from '../data/binder-form';
import { BinderGameGroup, binderCountLabel, groupBindersByGame } from '../data/binder-games';
import { BinderPaneAction } from '../pane/binder-pane.component';
import { BinderCoverComponent } from '../ui/binder-cover.component';

/**
 * Inventory › Binders (spec 9.12, board W15): "4 binders · 1 deck core" and New binder, one
 * section per game, a grid of binder cards (a 180 cover, the name, "9 cards · Public", the deck
 * core tag, a freshness line with "Still have them", "⋯"), and the deck core tip. A card opens
 * Cards filtered to that binder; binders reorder by drag within a game, or Move up and Move down.
 */
@Component({
  selector: 'app-binders-tab',
  imports: [
    CdkDrag,
    CdkDragPlaceholder,
    CdkDropList,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    BinderCoverComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameMonogramComponent,
    SkeletonComponent,
  ],
  template: `
    @if (error()) {
      <app-error-state
        title="Your binders could not load"
        retryLabel="Try again"
        (retry)="retry.emit()"
      />
    } @else if (binders() === null) {
      <div class="grid" aria-busy="true">
        <span class="visually-hidden">Loading your binders</span>
        @for (slot of [1, 2, 3, 4]; track slot) {
          <app-skeleton height="290px" />
        }
      </div>
    } @else if (binders()!.length === 0) {
      <app-empty-state
        icon="menu_book"
        title="No binders yet"
        description="Binders group your cards. Sell a whole deck as a deck core: photos, a price and a note are enough."
      >
        <button actions matButton="filled" type="button" (click)="newBinder.emit()">
          New binder
        </button>
      </app-empty-state>
    } @else {
      <div class="head">
        <p class="sum" data-testid="binders-summary">
          <strong>{{ summary().binders }}</strong
          >{{ summary().rest }}
        </p>
        <button
          matButton="outlined"
          type="button"
          (click)="newBinder.emit()"
          data-testid="binders-new"
        >
          <mat-icon aria-hidden="true">add</mat-icon>
          New binder
        </button>
      </div>
      @for (group of groups(); track group.game) {
        <section class="game" [attr.aria-labelledby]="'bt-game-' + group.game">
          <h2 class="game__head" [id]="'bt-game-' + group.game">
            <app-game-monogram [game]="group.game" size="22" />
            {{ group.info.label }}
            <span class="game__count">{{ countLabel(group.binders.length) }}</span>
          </h2>
          <ul
            class="grid"
            role="list"
            cdkDropList
            cdkDropListOrientation="mixed"
            [cdkDropListData]="group"
            [cdkDropListDisabled]="group.binders.length < 2"
            (cdkDropListDropped)="onDrop(group, $event)"
          >
            @for (binder of group.binders; track binder.id; let first = $first; let last = $last) {
              <li
                class="card"
                cdkDrag
                [cdkDragData]="binder"
                [class.card--editing]="editingId() === binder.id"
                [attr.data-testid]="'binder-card-' + binder.id"
              >
                <div class="card__ph" *cdkDragPlaceholder></div>
                @if (editingId() === binder.id) {
                  <span class="card__editing"
                    ><mat-icon aria-hidden="true">edit</mat-icon> Editing</span
                  >
                }
                <button
                  type="button"
                  class="card__open"
                  (click)="open.emit(binder)"
                  [attr.aria-label]="openLabel(binder)"
                >
                  <app-binder-cover variant="card" [binder]="binder" />
                </button>
                <div class="card__body">
                  <div class="card__title">
                    <button
                      type="button"
                      class="card__name"
                      (click)="open.emit(binder)"
                      tabindex="-1"
                    >
                      {{ binder.name }}
                    </button>
                    <button
                      matIconButton
                      type="button"
                      class="card__more"
                      [matMenuTriggerFor]="menu"
                      [matMenuTriggerData]="{ binder: binder, first: first, last: last }"
                      [attr.aria-label]="'More for ' + binder.name"
                    >
                      <mat-icon>more_horiz</mat-icon>
                    </button>
                  </div>
                  <p class="card__line">
                    <mat-icon aria-hidden="true">{{
                      binder.visibility === 'PRIVATE' ? 'lock' : 'public'
                    }}</mat-icon>
                    {{ line(binder) }}
                  </p>
                  @if (binder.sellsAsCore) {
                    <span class="card__core"
                      ><mat-icon aria-hidden="true">layers</mat-icon>{{ core(binder) }}</span
                    >
                  }
                  @if (binder.effectivePublic) {
                    <a
                      class="card__public"
                      [routerLink]="['/binders', binder.id]"
                      [attr.aria-label]="'View the public page of ' + binder.name"
                      [attr.data-testid]="'binder-public-' + binder.id"
                      >View public page</a
                    >
                  }
                </div>
                @if (needsConfirm(binder)) {
                  <div class="card__fresh">
                    <span
                      class="card__dot"
                      [class.card__dot--stale]="binder.freshness.state !== 'AGING'"
                      aria-hidden="true"
                    ></span>
                    <span class="card__fresh-text">{{ binder.freshness.label }}</span>
                    <button type="button" class="card__still" (click)="confirm.emit(binder)">
                      Still have them
                    </button>
                  </div>
                }
              </li>
            }
          </ul>
        </section>
      }
      <aside class="tip" aria-label="Tip">
        <mat-icon aria-hidden="true">layers</mat-icon>
        <p>
          <strong>{{ copy.tipTitle }}</strong> {{ copy.tipBody }}
        </p>
      </aside>
    }

    <mat-menu #menu="matMenu">
      <ng-template matMenuContent let-binder="binder" let-first="first" let-last="last">
        <button mat-menu-item type="button" (click)="act.emit({ kind: 'edit', binder })">
          <mat-icon>edit</mat-icon><span>Edit binder</span>
        </button>
        <button mat-menu-item type="button" (click)="act.emit({ kind: 'visibility', binder })">
          <mat-icon>{{ binder.visibility === 'PRIVATE' ? 'public' : 'lock' }}</mat-icon>
          <span>{{ binder.visibility === 'PRIVATE' ? 'Make public' : 'Make private' }}</span>
        </button>
        @if (binder.effectivePublic) {
          <a mat-menu-item [routerLink]="['/binders', binder.id]">
            <mat-icon>open_in_new</mat-icon><span>View public page</span>
          </a>
        }
        <button
          mat-menu-item
          type="button"
          [disabled]="first"
          (click)="act.emit({ kind: 'move', binder, offset: -1 })"
        >
          <mat-icon>arrow_upward</mat-icon><span>Move up</span>
        </button>
        <button
          mat-menu-item
          type="button"
          [disabled]="last"
          (click)="act.emit({ kind: 'move', binder, offset: 1 })"
        >
          <mat-icon>arrow_downward</mat-icon><span>Move down</span>
        </button>
        <button
          mat-menu-item
          type="button"
          class="danger"
          (click)="act.emit({ kind: 'delete', binder })"
        >
          <mat-icon>delete</mat-icon><span>Delete binder</span>
        </button>
      </ng-template>
    </mat-menu>
  `,
  styleUrl: './binders-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BindersTabComponent {
  readonly binders = input<BinderResponse[] | null>(null);
  readonly error = input(false, { transform: booleanAttribute });
  readonly editingId = input<string | null>(null);
  readonly open = output<BinderResponse>();
  readonly act = output<BinderPaneAction>();
  readonly reorder = output<{ binder: BinderResponse; offset: number }>();
  readonly newBinder = output<void>();
  readonly confirm = output<BinderResponse>();
  readonly retry = output<void>();

  protected readonly copy = BINDER_COPY;
  protected readonly groups = computed(() => groupBindersByGame(this.binders() ?? []));
  protected readonly summary = computed(() => {
    const binders = this.binders() ?? [];
    const cores = binders.filter((binder) => binder.sellsAsCore).length;
    const plain = binders.length;
    return {
      binders: binderCountLabel(plain),
      rest: cores > 0 ? ` · ${cores} ${cores === 1 ? 'deck core' : 'deck cores'}` : '',
    };
  });

  protected countLabel(count: number): string {
    return binderCountLabel(count);
  }

  protected line(binder: BinderResponse): string {
    return binderLine(binder);
  }

  protected core(binder: BinderResponse): string {
    return deckCoreTag(binder.askingPriceText);
  }

  protected openLabel(binder: BinderResponse): string {
    return `${binder.name}, ${binderLine(binder)}. See its cards`;
  }

  protected needsConfirm(binder: BinderResponse): boolean {
    return binder.itemCount > 0 && binder.freshness.state !== 'ACTIVE';
  }

  protected onDrop(group: BinderGameGroup, event: CdkDragDrop<BinderGameGroup>): void {
    const offset = event.currentIndex - event.previousIndex;
    const binder = group.binders[event.previousIndex];
    if (binder && offset !== 0) {
      this.reorder.emit({ binder, offset });
    }
  }
}
