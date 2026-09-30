import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { InventoryItemResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError } from '../../../core/http/api-error';
import { friendlyError } from '../../../core/http/api-error-messages';
import { CardImageComponent } from '../../../shared/catalog/card-image/card-image.component';
import { GamesStore } from '../../../shared/catalog/games.store';
import { gameInfo } from '../../../shared/domain/games';
import {
  API_FRESHNESS_LABELS,
  ApiFreshnessState,
  badgeFreshness,
  printingCode,
  printingImageUrl,
} from '../../../shared/inventory/inventory-labels';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../../shared/ui/confirm-dialog/confirm-dialog.component';
import { FreshnessBadgeComponent } from '../../../shared/ui/freshness-badge/freshness-badge.component';
import { VisibilityBadgeComponent } from '../../../shared/ui/visibility-badge/visibility-badge.component';
import { InventoryStore } from '../data/inventory.store';
import { createItemForm, itemFormValue, toUpdateRequest } from '../data/item-form';
import { itemVisibilityStatus } from '../data/visibility-status';
import { ItemDetailsFieldsComponent } from './item-details-fields.component';
import { ItemPhotosComponent } from './item-photos.component';

export interface ItemEditorData {
  item: InventoryItemResponse;
}

/** How the panel closed. */
export type ItemEditorResult = 'saved' | 'deleted' | undefined;

/**
 * Side panel editing one item: every field, photos, "confirm still available" and delete.
 * Saves only the changed fields (`PATCH`). Opened by the page with its injector so it shares the
 * page's {@link InventoryStore}.
 */
@Component({
  selector: 'app-item-editor-sheet',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    CardImageComponent,
    FreshnessBadgeComponent,
    ItemDetailsFieldsComponent,
    ItemPhotosComponent,
    VisibilityBadgeComponent,
  ],
  template: `
    @let it = item();
    <header class="es__header" [style.--es-accent]="accent()">
      <app-card-image class="es__thumb" [src]="image()" [game]="it.card.game" />
      <div class="es__heading">
        <p class="es__game">{{ gameLabel() }}</p>
        <h2 class="es__title" mat-dialog-title>{{ it.card.name }}</h2>
        <p class="es__meta">
          <span class="mono">{{ code() }}</span>
          @if (it.printing.setName) {
            · {{ it.printing.setName }}
          }
          @if (it.printing.rarity) {
            · {{ it.printing.rarity }}
          }
        </p>
        <div class="es__badges">
          <app-visibility-badge
            showLabel
            [visibility]="status().visibility"
            [pending]="status().pending"
            [label]="status().label"
            [note]="status().note"
          />
          <app-freshness-badge [state]="freshness()" [label]="it.freshness.label" />
        </div>
      </div>
      <button matIconButton type="button" class="es__close" mat-dialog-close aria-label="Close">
        <mat-icon>close</mat-icon>
      </button>
    </header>

    <mat-dialog-content class="es__content">
      <section
        class="es__fresh"
        [class.es__fresh--attention]="needsConfirmation()"
        aria-label="Availability check"
      >
        <mat-icon aria-hidden="true">{{ needsConfirmation() ? 'history' : 'verified' }}</mat-icon>
        <div class="es__fresh-text">
          <strong>{{ freshnessTitle() }}</strong>
          <span>{{ it.freshness.label }}. Confirming keeps it listed as fresh.</span>
        </div>
        <button matButton="outlined" type="button" [disabled]="busy()" (click)="confirm()">
          <mat-icon aria-hidden="true">task_alt</mat-icon>
          Confirm availability
        </button>
      </section>

      <form id="item-editor-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <app-item-details-fields
          [form]="form"
          [schema]="schema()"
          [binders]="store.binders() ?? []"
          [publicUntil]="it.publicUntil"
        />
      </form>

      <section class="es__section" aria-labelledby="es-photos">
        <h3 id="es-photos" class="es__section-title">Your photos</h3>
        <app-item-photos
          [images]="it.images"
          [busy]="uploading()"
          [error]="photoError()"
          (upload)="upload($event)"
          (remove)="removePhoto($event)"
        />
      </section>

      <section class="es__section es__danger" aria-labelledby="es-danger">
        <h3 id="es-danger" class="es__section-title">Remove from inventory</h3>
        <p>Deleting removes the card and its photos everywhere.</p>
        <button
          matButton="outlined"
          type="button"
          class="es__delete"
          [disabled]="busy()"
          (click)="remove()"
        >
          <mat-icon aria-hidden="true">delete</mat-icon>
          Delete card
        </button>
      </section>

      @if (error(); as error) {
        <p class="es__error" role="alert">{{ error }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions class="es__actions" align="end">
      <button matButton type="button" mat-dialog-close>Cancel</button>
      <button matButton="filled" type="submit" form="item-editor-form" [disabled]="busy()">
        {{ saving() ? 'Saving…' : 'Save changes' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .es__header {
      position: relative;
      display: flex;
      gap: var(--spacing-4);
      padding: var(--spacing-5) var(--spacing-6) var(--spacing-3);
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--es-accent) 14%, var(--color-surface)),
        transparent
      );
    }
    .es__thumb {
      flex: 0 0 76px;
      width: 76px;
    }
    .es__heading {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding-right: var(--spacing-8);
    }
    .es__game {
      margin: 0;
      color: var(--es-accent);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .es__title {
      margin: 0;
      padding: 0;
      font-size: var(--font-size-xl);
    }
    .es__title::before {
      display: none;
    }
    .es__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .es__badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-2);
      margin-top: 4px;
    }
    .es__close {
      position: absolute;
      top: var(--spacing-3);
      right: var(--spacing-3);
    }
    .es__content {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--spacing-5);
      max-height: none;
    }
    .es__fresh {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3);
      padding: var(--spacing-3);
      border-radius: var(--radius-md);
      background: var(--color-surface-variant);
    }
    .es__fresh > mat-icon {
      color: var(--color-status-fresh);
    }
    .es__fresh--attention {
      background: color-mix(in srgb, var(--color-status-stale) 10%, var(--color-surface));
    }
    .es__fresh--attention > mat-icon {
      color: var(--color-status-stale);
    }
    .es__fresh-text {
      display: flex;
      flex: 1 1 200px;
      flex-direction: column;
      font-size: var(--font-size-sm);
    }
    .es__section-title {
      margin-bottom: var(--spacing-2);
      font-size: var(--font-size-md);
    }
    .es__danger p {
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
    .es__delete {
      --mat-button-outlined-label-text-color: var(--color-danger);
    }
    .es__error {
      margin: 0;
      color: var(--color-danger);
    }
    .es__actions {
      border-top: 1px solid var(--color-border);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ItemEditorSheetComponent {
  private readonly data = inject<ItemEditorData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<ItemEditorSheetComponent, ItemEditorResult>>(MatDialogRef);
  private readonly dialog = inject(MatDialog);
  private readonly injector = inject(Injector);
  private readonly snackBar = inject(MatSnackBar);
  private readonly games = inject(GamesStore);
  protected readonly store = inject(InventoryStore);

  protected readonly item = signal(this.data.item);
  protected readonly form = createItemForm(itemFormValue(this.data.item));
  protected readonly saving = signal(false);
  protected readonly working = signal(false);
  protected readonly uploading = signal(false);
  protected readonly photoError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = computed(() => this.saving() || this.working());

  protected readonly schema = computed(() => this.games.schema(this.item().card.game));
  protected readonly image = computed(() => printingImageUrl(this.item().printing));
  protected readonly code = computed(() => printingCode(this.item().printing));
  protected readonly gameLabel = computed(() => gameInfo(this.item().card.game).label);
  protected readonly accent = computed(() => `var(${gameInfo(this.item().card.game).colorVar})`);
  protected readonly freshness = computed(() => badgeFreshness(this.item().freshness.state));
  protected readonly needsConfirmation = computed(() =>
    ['STALE', 'HIDDEN'].includes(this.item().freshness.state),
  );
  protected readonly freshnessTitle = computed(() => {
    const state = this.item().freshness.state as ApiFreshnessState;
    return state === 'ACTIVE' ? 'Listed as fresh' : API_FRESHNESS_LABELS[state];
  });
  protected readonly status = computed(() => {
    const item = this.item();
    const binder = item.binder ? this.store.bindersById().get(item.binder.id) : null;
    return itemVisibilityStatus(item, { binder, ownerVisible: this.store.ownerVisible() });
  });

  constructor() {
    void this.games.load();
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted fields.');
      return;
    }
    const patch = toUpdateRequest(this.form.getRawValue(), this.item());
    if (!patch) {
      this.dialogRef.close(undefined);
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.store.updateItem(this.item().id, patch);
      this.item.set(updated);
      this.snackBar.open(`${updated.card.name}: changes saved.`, 'OK', { duration: 4000 });
      this.dialogRef.close('saved');
    } catch (error) {
      this.showError(error as ApiError);
    } finally {
      this.saving.set(false);
    }
  }

  protected async confirm(): Promise<void> {
    await this.work(async () => {
      const updated = await this.store.confirmItem(this.item().id);
      this.item.set(updated);
      this.snackBar.open('Confirmed: listed as fresh again.', 'OK', { duration: 4000 });
    });
  }

  protected async remove(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: `Delete ${this.item().card.name}?`,
            message: 'The card and its photos are removed from your inventory and every listing.',
            confirmLabel: 'Delete card',
            tone: 'danger',
          },
          panelClass: 'app-dialog--md',
          injector: this.injector,
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    await this.work(async () => {
      await this.store.deleteItem(this.item().id);
      this.snackBar.open(`${this.item().card.name} deleted.`, 'OK', { duration: 4000 });
      this.dialogRef.close('deleted');
    });
  }

  protected async upload(file: File): Promise<void> {
    this.uploading.set(true);
    this.photoError.set(null);
    try {
      this.item.set(await this.store.uploadImage(this.item().id, file));
    } catch (error) {
      this.photoError.set(friendlyError(error as ApiError).message);
    } finally {
      this.uploading.set(false);
    }
  }

  protected async removePhoto(imageId: string): Promise<void> {
    this.uploading.set(true);
    this.photoError.set(null);
    try {
      await this.store.deleteImage(this.item().id, imageId);
      this.item.update((item) => ({
        ...item,
        images: item.images.filter((image) => image.id !== imageId),
      }));
    } catch (error) {
      this.photoError.set(friendlyError(error as ApiError).message);
    } finally {
      this.uploading.set(false);
    }
  }

  private async work(action: () => Promise<void>): Promise<void> {
    this.working.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.showError(error as ApiError);
    } finally {
      this.working.set(false);
    }
  }

  private showError(error: ApiError): void {
    for (const [field, message] of Object.entries(error.fieldErrors ?? {})) {
      const control = this.form.get(field);
      if (control) {
        control.setErrors({ server: message });
        control.markAsTouched();
      }
    }
    this.error.set(friendlyError(error).message);
  }
}
