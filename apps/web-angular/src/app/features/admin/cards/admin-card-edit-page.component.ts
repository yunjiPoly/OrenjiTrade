import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
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
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '../../../core/feedback/toast.service';
import { RECORDED } from '../console/console-actions';
import { AdminIconComponent } from '../console/admin-icon.component';
import { GameBadgeComponent } from '../console/game-badge.component';
import { RouterLink } from '@angular/router';
import {
  AdminCatalogService,
  AdminPrintingRequest,
  CardDetail,
  CatalogService,
  GameMetadataField,
  PrintingDetail,
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
    NgTemplateOutlet,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AdminIconComponent,
    CardImageComponent,
    EmptyStateComponent,
    GameBadgeComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-card-edit-page.component.html',
  styleUrls: [
    '../shared/admin-page.scss',
    '../console/console-form.scss',
    './admin-card-edit-page.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCardEditPageComponent {
  private readonly catalog = inject(CatalogService);
  private readonly adminApi = inject(AdminCatalogService);
  private readonly dialog = inject(MatDialog);
  private readonly toasts = inject(ToastService);
  private readonly games = inject(GamesStore);

  /** The card's id, or `new` for "New card" (`POST /admin/cards`, board A11). */
  readonly id = input.required<string>();
  /** Inside the Cards page's drawer (board A11) rather than its own page. */
  readonly embedded = input(false, { transform: booleanAttribute });
  /** The game a new card starts in (the list's game filter). */
  readonly newGame = input<string | undefined>();
  /** A new card was created: the drawer opens it. */
  readonly created = output<string>();
  /** A card or a printing was saved: the list reloads. */
  readonly changed = output<void>();

  protected readonly creating = computed(() => this.id() === 'new');
  protected readonly createGame = linkedSignal(
    () => this.newGame() || this.games.games()?.[0]?.slug || 'yugioh',
  );
  protected readonly gameOptions = computed(() => this.games.games() ?? []);

  protected readonly card = signal<CardDetail | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly saving = signal(false);
  protected readonly editingPrinting = signal<string | null>(null);
  protected readonly fields = computed<GameMetadataField[]>(
    () =>
      this.games.schema(this.creating() ? this.createGame() : this.card()?.game)?.metadataFields ??
      [],
  );
  /** The schema fields without a value (board A11: "Show 6 empty fields"). */
  protected readonly showEmpty = signal(false);
  private readonly emptyKeys = signal<ReadonlySet<string>>(new Set());
  protected readonly shownFields = computed(() =>
    this.creating() || this.showEmpty()
      ? this.fields()
      : this.fields().filter((field) => !this.emptyKeys().has(field.key)),
  );
  protected readonly hiddenCount = computed(() => this.fields().length - this.shownFields().length);
  protected readonly gameName = (slug: string | null | undefined) =>
    this.games.games()?.find((game) => game.slug === slug)?.shortName ?? slug ?? '';
  protected readonly notFound = computed(() => {
    const error = this.error();
    return !!error && (error.status === 404 || error.errorCode === 'VALIDATION_FAILED');
  });

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
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
      untracked(() => {
        if (id === 'new') {
          this.card.set(null);
          this.error.set(null);
          this.form.reset({ name: '', cardType: '', subtype: '', text: '' });
          this.fillMetadata(null, this.fields());
        } else {
          void this.load(id);
        }
      });
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

  /** The name's error once touched or a save was tried, then the API's answer. */
  protected nameError(): string | null {
    const name = this.form.controls.name;
    if (name.touched && name.hasError('required')) {
      return 'A name is required.';
    }
    return this.serverErrors()['name'] ?? null;
  }

  /** Whether a list attribute holds a value (its check box). */
  protected listHas(value: MetadataFormValue, option: string): boolean {
    return Array.isArray(value) && value.includes(option);
  }

  /** Checks or unchecks one value of a list attribute, in the schema's order. */
  protected toggleListValue(
    control: FormControl<MetadataFormValue>,
    option: string,
    checked: boolean,
  ): void {
    const current = Array.isArray(control.value) ? control.value : [];
    const next = checked
      ? [...current.filter((value) => value !== option), option]
      : current.filter((value) => value !== option);
    control.setValue(next);
    control.markAsDirty();
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
    if (this.creating()) {
      await this.create();
      return;
    }
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
      this.toasts.show({ title: `${updated.name} saved.`, sub: RECORDED });
      this.changed.emit();
    } catch (error) {
      const apiError = error as ApiError;
      this.serverErrors.set(apiError.fieldErrors);
      this.failed(apiError);
    } finally {
      this.saving.set(false);
    }
  }

  /** "New card" (`POST /admin/cards`): the drawer then opens the new card. */
  private async create(): Promise<void> {
    this.form.markAllAsTouched();
    const game = this.createGame();
    if (this.form.invalid || this.fields().some((field) => this.fieldError(field))) {
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.serverErrors.set({});
    try {
      const created = await this.call(
        this.adminApi.createCard(
          {
            adminCardRequest: {
              gameSlug: game,
              name: value.name.trim(),
              cardType: value.cardType.trim() || undefined,
              subtype: value.subtype.trim() || undefined,
              text: value.text.trim() || undefined,
              metadata: metadataFromForm(this.fields(), this.metadata.getRawValue(), {}),
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.toasts.show({ title: `${created.name} created.`, sub: RECORDED });
      this.changed.emit();
      if (created.id) {
        this.created.emit(created.id);
      }
    } catch (error) {
      const apiError = error as ApiError;
      this.serverErrors.set(apiError.fieldErrors);
      this.failed(apiError);
    } finally {
      this.saving.set(false);
    }
  }

  protected pickGame(event: Event): void {
    this.createGame.set((event.target as HTMLSelectElement).value);
  }

  private failed(error: ApiError): void {
    this.toasts.show({
      title: friendlyMessage(error),
      sub: error.requestId ? `Request ${error.requestId}` : null,
      tone: 'error',
    });
  }

  /** "Add printing" (`POST /admin/cards/{id}/printings`, board A11). */
  protected async addPrinting(): Promise<void> {
    const card = this.card();
    if (!card?.id || this.editingPrinting() !== null) {
      return;
    }
    this.editingPrinting.set('new');
    try {
      const sets = await this.call(
        this.catalog.listSets({ game: card.game, size: 100 }, 'body', false, {
          context: silentErrors(),
        }),
      );
      const request = await firstValueFrom(
        this.dialog
          .open<PrintingEditDialogComponent, PrintingEditDialogData, AdminPrintingRequest>(
            PrintingEditDialogComponent,
            {
              data: {
                detail: { printing: {}, metadata: {} } as PrintingDetail,
                schema: this.games.schema(card.game),
                sets: sets.items ?? [],
                create: true,
              },
              panelClass: 'app-dialog--md',
            },
          )
          .afterClosed(),
      );
      if (!request) {
        return;
      }
      await this.call(
        this.adminApi.createPrinting(
          { id: card.id, adminPrintingRequest: request },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.toasts.show({
        title: `Printing ${request.printingCode ?? request.collectorNumber} added.`,
        sub: RECORDED,
      });
      this.changed.emit();
      await this.load(card.id);
    } catch (error) {
      this.failed(error as ApiError);
    } finally {
      this.editingPrinting.set(null);
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
      this.toasts.show({
        title: `Printing ${request.printingCode ?? request.collectorNumber} saved.`,
        sub: RECORDED,
      });
      this.changed.emit();
      await this.load(card.id ?? this.id());
    } catch (error) {
      this.failed(error as ApiError);
    } finally {
      this.editingPrinting.set(null);
    }
  }

  private fillMetadata(card: CardDetail | null, fields: readonly GameMetadataField[]): void {
    for (const key of Object.keys(this.metadata.controls)) {
      this.metadata.removeControl(key, { emitEvent: false });
    }
    const values = metadataFormValues(fields, card?.metadata);
    const empty = new Set<string>();
    for (const field of fields) {
      this.metadata.addControl(
        field.key,
        new FormControl<MetadataFormValue>(values[field.key], { nonNullable: true }),
        { emitEvent: false },
      );
      const value = values[field.key];
      if (
        value === '' ||
        value === null ||
        value === false ||
        (Array.isArray(value) && !value.length)
      ) {
        empty.add(field.key);
      }
    }
    this.emptyKeys.set(empty);
    this.showEmpty.set(false);
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
