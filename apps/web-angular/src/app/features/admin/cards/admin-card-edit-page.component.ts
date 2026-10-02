import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormRecord,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  AdminCatalogService,
  AdminPrintingRequest,
  CardDetail,
  CatalogService,
  GameMetadataField,
  PrintingSummary,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  languageLabel,
} from '../../../shared/catalog/catalog-labels';
import { GamesStore } from '../../../shared/catalog/games.store';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { GameChipComponent } from '../../../shared/ui/game-chip/game-chip.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import {
  MetadataFormValue,
  metadataFieldError,
  metadataFormValues,
  metadataFromForm,
} from './metadata-form';
import {
  PrintingEditDialogComponent,
  PrintingEditDialogData,
} from './printing-edit-dialog.component';

/**
 * `/admin/cards/:id`: correct a card (name, types, text, schema-driven metadata) and its
 * printings. Every save is audited (`card.update`, `card_printing.update`).
 */
@Component({
  selector: 'app-admin-card-edit-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    CardImageComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameChipComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-card-edit-page.component.html',
  styleUrls: ['../shared/admin-page.scss', './admin-card-edit-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCardEditPageComponent {
  private readonly catalog = inject(CatalogService);
  private readonly adminApi = inject(AdminCatalogService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly games = inject(GamesStore);

  readonly id = input.required<string>();

  protected readonly card = signal<CardDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly editingPrinting = signal<string | null>(null);
  protected readonly fields = computed<GameMetadataField[]>(
    () => this.games.schema(this.card()?.game)?.metadataFields ?? [],
  );
  protected readonly notFound = computed(() => {
    const error = this.error();
    return !!error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED');
  });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(200)]],
    cardType: ['', Validators.maxLength(80)],
    subtype: ['', Validators.maxLength(80)],
    text: ['', Validators.maxLength(4000)],
  });
  protected readonly metadata = new FormRecord<FormControl<MetadataFormValue>>({});
  protected readonly serverErrors = signal<Record<string, string>>({});

  protected readonly edition = editionLabel;
  /** Front picture of a printing (API URL). */
  protected readonly printingImage = printingImageUrl;
  protected readonly finish = finishLabel;
  protected readonly language = languageLabel;
  protected readonly price = formatMarketPrice;

  constructor() {
    void this.games.load();
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
    // Rebuild the metadata controls once both the card and its game's schema are known.
    effect(() => {
      const card = this.card();
      const fields = this.fields();
      untracked(() => this.fillMetadata(card, fields));
    });
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected fieldError(field: GameMetadataField): string | null {
    const control = this.metadata.controls[field.key];
    return (
      this.serverErrors()[`metadata.${field.key}`] ??
      (control ? metadataFieldError(field, control.value) : null)
    );
  }

  protected async load(id: string): Promise<void> {
    this.error.set(null);
    try {
      const card = await this.call(
        this.catalog.getCard({ id }, 'body', false, { context: silentErrors() }),
      );
      this.card.set(card);
      this.form.reset({
        name: card.name ?? '',
        cardType: card.cardType ?? '',
        subtype: card.subtype ?? '',
        text: card.text ?? '',
      });
    } catch (error) {
      this.error.set(error as ApiError);
    }
  }

  protected async save(): Promise<void> {
    const card = this.card();
    this.form.markAllAsTouched();
    if (!card?.id || this.form.invalid || this.fields().some((field) => this.fieldError(field))) {
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.serverErrors.set({});
    try {
      const updated = await this.call(
        this.adminApi.updateCard(
          {
            id: card.id,
            adminCardRequest: {
              gameSlug: card.game,
              name: value.name.trim(),
              cardType: value.cardType.trim() || undefined,
              subtype: value.subtype.trim() || undefined,
              text: value.text.trim() || undefined,
              metadata: metadataFromForm(this.fields(), this.metadata.getRawValue(), card.metadata),
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.card.set(updated);
      this.form.markAsPristine();
      this.snackBar.open(`${updated.name} saved.`, 'OK', { duration: 4000 });
    } catch (error) {
      const apiError = error as ApiError;
      this.serverErrors.set(apiError.fieldErrors);
      this.snackBar.open(friendlyMessage(apiError), 'OK', { duration: 6000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async editPrinting(printing: PrintingSummary): Promise<void> {
    const card = this.card();
    if (!printing.id || !card) {
      return;
    }
    this.editingPrinting.set(printing.id);
    try {
      const [detail, sets] = await Promise.all([
        this.call(
          this.catalog.getPrinting({ id: printing.id }, 'body', false, { context: silentErrors() }),
        ),
        this.call(
          this.catalog.listSets({ game: card.game, size: 100 }, 'body', false, {
            context: silentErrors(),
          }),
        ),
      ]);
      const request = await firstValueFrom(
        this.dialog
          .open<PrintingEditDialogComponent, PrintingEditDialogData, AdminPrintingRequest>(
            PrintingEditDialogComponent,
            {
              data: { detail, schema: this.games.schema(card.game), sets: sets.items ?? [] },
              panelClass: 'app-dialog--md',
            },
          )
          .afterClosed(),
      );
      if (!request) {
        return;
      }
      await this.call(
        this.adminApi.updatePrinting(
          { id: printing.id, adminPrintingRequest: request },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.snackBar.open(
        `Printing ${request.printingCode ?? request.collectorNumber} saved.`,
        'OK',
        {
          duration: 4000,
        },
      );
      await this.load(card.id ?? this.id());
    } catch (error) {
      this.snackBar.open(friendlyMessage(error as ApiError), 'OK', { duration: 6000 });
    } finally {
      this.editingPrinting.set(null);
    }
  }

  private fillMetadata(card: CardDetail | null, fields: readonly GameMetadataField[]): void {
    for (const key of Object.keys(this.metadata.controls)) {
      this.metadata.removeControl(key, { emitEvent: false });
    }
    const values = metadataFormValues(fields, card?.metadata);
    for (const field of fields) {
      this.metadata.addControl(
        field.key,
        new FormControl<MetadataFormValue>(values[field.key], { nonNullable: true }),
        { emitEvent: false },
      );
    }
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
