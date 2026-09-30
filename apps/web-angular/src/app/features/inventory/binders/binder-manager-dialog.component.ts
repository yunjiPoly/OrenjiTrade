import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { BinderResponse } from '@orenji/api-client';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { PublishMode } from '../../../shared/inventory/inventory-labels';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { VisibilityBadgeComponent } from '../../../shared/ui/visibility-badge/visibility-badge.component';
import { InventoryStore } from '../data/inventory.store';
import { binderVisibilityStatus } from '../data/visibility-status';
import { BinderActionsService } from './binder-actions.service';
import { BINDER_NAME_MAX } from './binder-form-dialog.component';
import { BinderPublishMenuComponent } from './binder-publish-menu.component';

/**
 * Binder manager: reorder (drag and drop, or the move buttons from the keyboard), rename in
 * place, publish with a duration or make private, delete, and create new binders.
 */
@Component({
  selector: 'app-binder-manager-dialog',
  imports: [
    DragDropModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    BinderPublishMenuComponent,
    SkeletonComponent,
    VisibilityBadgeComponent,
  ],
  template: `
    <h2 mat-dialog-title>Manage binders</h2>
    <mat-dialog-content>
      <p class="bm__lead">
        Drag binders to reorder them, or use the arrows. The order is the one collectors see.
      </p>
      @if (entries(); as list) {
        @if (list.length === 0) {
          <p class="bm__empty">You have no binders yet.</p>
        }
        <ol
          class="bm__list"
          cdkDropList
          aria-label="Binders in display order"
          (cdkDropListDropped)="drop($event)"
        >
          @for (
            entry of list;
            track entry.binder.id;
            let i = $index, first = $first, last = $last
          ) {
            @let b = entry.binder;
            <li class="bm__row" cdkDrag [cdkDragDisabled]="busy()" data-testid="binder-row">
              <span class="bm__handle" cdkDragHandle aria-hidden="true">
                <mat-icon>drag_indicator</mat-icon>
              </span>
              <app-visibility-badge
                [focusable]="false"
                [visibility]="entry.status.visibility"
                [pending]="entry.status.pending"
                [label]="entry.status.label"
                [note]="entry.status.note"
              />
              @if (renaming() === b.id) {
                <form class="bm__rename" (submit)="saveName(b, $event)">
                  <mat-form-field appearance="outline" subscriptSizing="dynamic">
                    <mat-label>Name of {{ b.name }}</mat-label>
                    <input
                      matInput
                      [formControl]="nameControl"
                      [maxlength]="nameMax"
                      (keydown.escape)="cancelRename($event)"
                    />
                  </mat-form-field>
                  <button matButton="filled" type="submit" [disabled]="busy()">Save</button>
                  <button matButton type="button" (click)="cancelRename()">Cancel</button>
                </form>
              } @else {
                <span class="bm__text">
                  <span class="bm__name">{{ b.name }}</span>
                  <span class="bm__count">
                    {{ b.itemCount }} {{ b.itemCount === 1 ? 'card' : 'cards' }} ·
                    {{ entry.status.label }}
                  </span>
                </span>
                <span class="bm__actions">
                  <button
                    matIconButton
                    type="button"
                    [attr.data-move]="'up-' + b.id"
                    [disabled]="first"
                    [attr.aria-label]="'Move ' + b.name + ' up'"
                    (click)="move(i, -1)"
                  >
                    <mat-icon>arrow_upward</mat-icon>
                  </button>
                  <button
                    matIconButton
                    type="button"
                    [attr.data-move]="'down-' + b.id"
                    [disabled]="last"
                    [attr.aria-label]="'Move ' + b.name + ' down'"
                    (click)="move(i, 1)"
                  >
                    <mat-icon>arrow_downward</mat-icon>
                  </button>
                  <app-binder-publish-menu
                    compact
                    [binder]="b"
                    [disabled]="busy()"
                    (publish)="publish(b, $event)"
                    (unpublish)="unpublish(b)"
                  />
                  <button
                    matIconButton
                    type="button"
                    [attr.aria-label]="'Rename ' + b.name"
                    (click)="startRename(b)"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    matIconButton
                    type="button"
                    [attr.aria-label]="'Delete ' + b.name"
                    (click)="remove(b)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </span>
              }
            </li>
          }
        </ol>
      } @else {
        <app-skeleton variant="list" lines="3" />
      }
    </mat-dialog-content>
    <mat-dialog-actions class="bm__footer">
      <button matButton="tonal" type="button" (click)="create()">
        <mat-icon aria-hidden="true">add</mat-icon>
        New binder
      </button>
      <span class="bm__spacer"></span>
      <button matButton="filled" type="button" mat-dialog-close>Done</button>
    </mat-dialog-actions>
  `,
  styles: `
    .bm__lead,
    .bm__empty {
      margin: 0 0 var(--spacing-3);
      color: var(--color-text-muted);
    }
    .bm__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .bm__row {
      display: flex;
      align-items: center;
      gap: var(--spacing-2);
      padding: var(--spacing-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
    }
    .bm__handle {
      display: grid;
      place-items: center;
      color: var(--color-text-muted);
      cursor: grab;
    }
    .bm__text {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-width: 0;
    }
    .bm__name {
      overflow: hidden;
      font-weight: var(--font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .bm__count {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .bm__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
    }
    .bm__rename {
      display: flex;
      flex: 1 1 auto;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-2);
    }
    .bm__footer {
      display: flex;
    }
    .bm__spacer {
      flex: 1 1 auto;
    }
    .cdk-drag-preview {
      box-shadow: var(--elevation-floating);
    }
    .cdk-drag-placeholder {
      opacity: 0.35;
    }
    .cdk-drag-animating,
    .bm__list.cdk-drop-list-dragging .bm__row:not(.cdk-drag-placeholder) {
      transition: transform var(--motion-duration-base) var(--motion-easing-standard);
    }
    @media (max-width: 599px) {
      .bm__row {
        flex-wrap: wrap;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BinderManagerDialogComponent {
  private readonly store = inject(InventoryStore);
  private readonly actions = inject(BinderActionsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly nameMax = BINDER_NAME_MAX;
  protected readonly busy = signal(false);
  protected readonly renaming = signal<string | null>(null);
  protected readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(BINDER_NAME_MAX)],
  });
  protected readonly entries = computed(() => {
    const binders = this.store.binders();
    const ownerVisible = this.store.ownerVisible();
    return binders
      ? binders.map((binder) => ({
          binder,
          status: binderVisibilityStatus(binder, { ownerVisible }),
        }))
      : null;
  });

  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    if (event.previousIndex !== event.currentIndex) {
      await this.reorder(event.previousIndex, event.currentIndex);
    }
  }

  protected async move(index: number, delta: number): Promise<void> {
    const binders = this.store.binders() ?? [];
    const target = index + delta;
    if (target < 0 || target >= binders.length) {
      return;
    }
    const id = binders[index].id;
    const saving = this.reorder(index, target);
    // Keep the keyboard where it was: on the same arrow of the moved binder (or the other arrow
    // once it reached the top or the bottom).
    afterNextRender(
      () => {
        const direction = delta < 0 ? 'up' : 'down';
        const root = this.host.nativeElement;
        const button =
          root.querySelector<HTMLButtonElement>(
            `[data-move="${direction}-${id}"]:not([disabled])`,
          ) ?? root.querySelector<HTMLButtonElement>(`[data-move$="-${id}"]:not([disabled])`);
        button?.focus();
      },
      { injector: this.injector },
    );
    await saving;
  }

  protected startRename(binder: BinderResponse): void {
    this.nameControl.setValue(binder.name);
    this.renaming.set(binder.id);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLInputElement>('.bm__rename input')?.focus(),
      { injector: this.injector },
    );
  }

  protected cancelRename(event?: Event): void {
    event?.stopPropagation();
    this.renaming.set(null);
  }

  protected async saveName(binder: BinderResponse, event: Event): Promise<void> {
    event.preventDefault();
    const name = this.nameControl.value.trim();
    if (!name || name.length > BINDER_NAME_MAX) {
      this.nameControl.markAsTouched();
      return;
    }
    if (name === binder.name) {
      this.renaming.set(null);
      return;
    }
    this.busy.set(true);
    try {
      await this.store.updateBinder(binder.id, { name });
      this.renaming.set(null);
      this.snackBar.open(`Renamed to “${name}”.`, 'OK', { duration: 4000 });
    } catch (error) {
      this.snackBar.open(friendlyError(error as ApiError).message, 'OK', { duration: 8000 });
    } finally {
      this.busy.set(false);
    }
  }

  protected async publish(binder: BinderResponse, mode: PublishMode): Promise<void> {
    await this.guard(() => this.actions.publish(binder, mode));
  }

  protected async unpublish(binder: BinderResponse): Promise<void> {
    await this.guard(() => this.actions.unpublish(binder));
  }

  protected async remove(binder: BinderResponse): Promise<void> {
    await this.guard(() => this.actions.remove(binder));
  }

  protected async create(): Promise<void> {
    await this.actions.create();
  }

  /** Moves right away; the store saves the orders one after the other. */
  private async reorder(from: number, to: number): Promise<void> {
    const ids = (this.store.binders() ?? []).map((binder) => binder.id);
    moveItemInArray(ids, from, to);
    try {
      await this.store.reorderBinders(ids);
    } catch (error) {
      this.snackBar.open(friendlyError(error as ApiError).message, 'OK', { duration: 8000 });
    }
  }

  private async guard(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } finally {
      this.busy.set(false);
    }
  }
}
