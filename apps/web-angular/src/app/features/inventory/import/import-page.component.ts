import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import {
  BulkInventoryImportRequest,
  CatalogService,
  InventoryImportLimits,
  InventoryImportResponse,
  InventoryImportRow,
  InventoryImportService,
  PrintingSummary,
} from '@orenji/api-client';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { SKIP_LIMIT_DIALOG, silentErrors } from '../../../core/http/http-context';
import { ShellTabTitleDirective } from '../../../core/layout/shell-tab-title.directive';
import { GamesStore } from '../../../shared/catalog/games.store';
import { printingCode, printingImageUrl } from '../../../shared/inventory/inventory-labels';
import { CardImageComponent } from '../../../shared/ui/card-image/card-image.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../../shared/ui/segmented/segmented.component';
import { ImportHandoff, ImportSourceChoice, sourceOfFile } from './import-handoff.service';
import {
  IMPORT_SOURCES,
  ImportProblem,
  ROW_STATE_LABEL,
  RowState,
  addLabel,
  doneLines,
  fileLine,
  footerLine,
  formatBytes,
  importRefusal,
  keptLine,
  limitsLine,
  refusalBeforeUpload,
  rowName,
  rowState,
  sectionsLine,
  unmatchedWhy,
} from './import-labels';

type Phase = 'source' | 'uploading' | 'check' | 'committing' | 'done';
type RowFilter = 'all' | 'choose' | 'unmatched';
type Section = 'main' | 'extra' | 'side';

const ROWS_PAGE = 100;

const SOURCES: readonly SegmentOption<ImportSourceChoice>[] = [
  { value: 'YDK', label: IMPORT_SOURCES.YDK.toggle },
  { value: 'COLLECTR_CSV', label: IMPORT_SOURCES.COLLECTR_CSV.toggle },
];

/**
 * `/inventory/import` (spec 9.11, boards W16 and W17; a lazy workspace page): Source · Check ·
 * Done. The source column takes a `.ydk` deck file or a Collectr `.csv` export (dropped, chosen or
 * pasted), with the limits read from `GET /inventory/imports/limits`; the main column checks every
 * line (the printing, the copies, included or not) through the existing `/inventory/imports`
 * endpoints; "Add N cards" commits (finishing a commit that was cut), and Done says what was
 * added. The commit does not return the new items' ids, so the imported cards do not open already
 * selected: Inventory opens sorted by Recently added (decision 19; the report says so).
 */
@Component({
  selector: 'app-import-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    RouterLink,
    CardImageComponent,
    EmptyStateComponent,
    GameMonogramComponent,
    SegmentedComponent,
    ShellTabTitleDirective,
  ],
  templateUrl: './import-page.component.html',
  styleUrl: './import-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImportPageComponent {
  private readonly api = inject(InventoryImportService);
  private readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly handoff = inject(ImportHandoff);
  protected readonly games = inject(GamesStore);

  /** `?source=ydk|csv` (Add cards' menu, a dropped file). */
  readonly source = input<string | undefined>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly sources = SOURCES;
  protected readonly info = IMPORT_SOURCES;
  protected readonly stateLabel = ROW_STATE_LABEL;
  protected readonly signedIn = signal<boolean | null>(null);
  protected readonly phase = signal<Phase>('source');
  protected readonly choice = signal<ImportSourceChoice>('YDK');
  protected readonly csvGame = signal('');
  protected readonly limits = signal<InventoryImportLimits | null>(null);
  protected readonly limitsError = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly fileSize = signal<number | null>(null);
  protected readonly pasteOpen = signal(false);
  protected readonly pasted = signal('');
  protected readonly problem = signal<ImportProblem | null>(null);
  protected readonly over = signal(false);
  protected readonly preview = signal<InventoryImportResponse | null>(null);
  protected readonly rows = signal<InventoryImportRow[]>([]);
  protected readonly rowsTotal = signal(0);
  protected readonly rowsPage = signal(0);
  protected readonly rowsLoading = signal(false);
  protected readonly rowsError = signal(false);
  protected readonly filter = signal<RowFilter>('all');
  protected readonly busyRows = signal<ReadonlySet<string>>(new Set());
  protected readonly hidden = signal<ReadonlySet<Section>>(new Set());
  protected readonly printings = signal<Record<string, PrintingSummary[]>>({});
  protected readonly working = signal(false);
  protected readonly unmatchedDone = signal<InventoryImportRow[]>([]);

  protected readonly limitsText = computed(() => limitsLine(this.choice(), this.limits()));
  protected readonly keptText = computed(() => keptLine(this.limits()));
  protected readonly isDeck = computed(() => this.preview()?.source === 'YDK');
  protected readonly footer = computed(() => {
    const preview = this.preview();
    return preview ? footerLine(preview) : null;
  });
  protected readonly addText = computed(() => {
    const preview = this.preview();
    return preview ? addLabel(preview) : 'Add cards';
  });
  protected readonly blocked = computed(() => (this.preview()?.summary.toChoose ?? 0) > 0);
  protected readonly empty = computed(() => (this.preview()?.summary.items ?? 0) === 0);
  protected readonly sections = computed(() => {
    const preview = this.preview();
    return preview ? sectionsLine(preview) : null;
  });
  protected readonly done = computed(() => {
    const preview = this.preview();
    return preview ? doneLines(preview) : null;
  });
  /** Rows by deck section (a deck file), or one group (a CSV). */
  protected readonly groups = computed(() => {
    const rows = this.rows();
    const preview = this.preview();
    if (preview?.source !== 'YDK') {
      return [{ key: 'all' as const, title: null, rows, include: true, copies: 0 }];
    }
    const sections = preview.sections;
    const of = (key: Section) =>
      rows.filter((row) => {
        const deck = row.deck;
        return key === 'main' ? (deck?.main ?? 0) > 0 : key === 'extra' ? (deck?.extra ?? 0) > 0 : (deck?.side ?? 0) > 0;
      });
    return (
      [
        { key: 'main' as const, title: 'Main deck', include: sections?.includeMain ?? true, copies: sections?.mainCopies ?? 0 },
        { key: 'extra' as const, title: 'Extra deck', include: sections?.includeExtra ?? true, copies: sections?.extraCopies ?? 0 },
        { key: 'side' as const, title: 'Side deck', include: sections?.includeSide ?? true, copies: sections?.sideCopies ?? 0 },
      ] as const
    )
      .map((group) => ({ ...group, rows: of(group.key) }))
      .filter((group) => group.rows.length > 0);
  });

  constructor() {
    void this.auth.ready().then(async () => {
      const signedIn = this.auth.isAuthenticated();
      this.signedIn.set(signedIn);
      if (!signedIn) {
        return;
      }
      void this.games.load();
      const wanted = this.source();
      if (wanted === 'csv') {
        this.choice.set('COLLECTR_CSV');
      }
      await this.loadLimits();
      const file = this.handoff.take();
      if (file) {
        this.choice.set(sourceOfFile(file.name) ?? this.choice());
        await this.upload(file);
        return;
      }
      await this.resume();
    });
  }

  // --- source --------------------------------------------------------------------------------

  async loadLimits(): Promise<void> {
    this.limitsError.set(false);
    try {
      this.limits.set(
        await this.call(this.api.getInventoryImportLimits('body', false, { context: silentErrors() })),
      );
    } catch {
      this.limitsError.set(true);
    }
  }

  protected chooseSource(source: ImportSourceChoice): void {
    this.choice.set(source);
    this.problem.set(null);
  }

  protected pickFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void this.upload(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.over.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      const source = sourceOfFile(file.name);
      if (source) {
        this.choice.set(source);
      }
      void this.upload(file);
    }
  }

  protected async uploadPasted(): Promise<void> {
    const text = this.pasted();
    if (!text.trim()) {
      this.problem.set({ title: 'Nothing to check yet', message: 'Paste the text of the file first.' });
      return;
    }
    const name = `pasted${IMPORT_SOURCES[this.choice()].extension}`;
    await this.upload(new File([text], name, { type: 'text/plain' }));
  }

  async upload(file: File): Promise<void> {
    const source = this.choice();
    this.problem.set(null);
    const early = refusalBeforeUpload(source, file.size, this.limits());
    if (early) {
      this.problem.set(early);
      return;
    }
    this.fileName.set(file.name);
    this.fileSize.set(file.size);
    this.phase.set('uploading');
    try {
      const preview = await this.call(
        this.api.createInventoryImport(
          { source, file, game: source === 'COLLECTR_CSV' && this.csvGame() ? this.csvGame() : undefined },
          'body',
          false,
          { context: silentErrors().set(SKIP_LIMIT_DIALOG, true) },
        ),
      );
      this.showPreview(preview);
    } catch (error) {
      this.phase.set(this.preview() ? 'check' : 'source');
      this.problem.set(importRefusal(error as ApiError, source));
    }
  }

  /** An open preview of this collector (kept 60 minutes) opens again; a cut commit finishes. */
  private async resume(): Promise<void> {
    try {
      const imports = await this.call(this.api.listInventoryImports('body', false, { context: silentErrors() }));
      const open = imports.find((candidate) => candidate.status === 'COMMITTING')
        ?? imports.find((candidate) => candidate.status === 'PENDING' && Date.parse(candidate.expiresAt) > Date.now());
      if (open) {
        this.choice.set(open.source === 'COLLECTR_CSV' ? 'COLLECTR_CSV' : 'YDK');
        this.showPreview(open);
        if (open.status === 'COMMITTING') {
          await this.commit();
        }
      }
    } catch {
      // Nothing to resume: the source column stays.
    }
  }

  private showPreview(preview: InventoryImportResponse): void {
    this.preview.set(preview);
    this.phase.set('check');
    this.filter.set('all');
    this.hidden.set(new Set());
    void this.loadRows(true);
  }

  // --- check ---------------------------------------------------------------------------------

  protected async setFilter(filter: RowFilter): Promise<void> {
    this.filter.set(filter);
    await this.loadRows(true);
  }

  async loadRows(reset: boolean): Promise<void> {
    const preview = this.preview();
    if (!preview) {
      return;
    }
    const page = reset ? 0 : this.rowsPage() + 1;
    const filter = this.filter();
    this.rowsLoading.set(true);
    this.rowsError.set(false);
    try {
      const result = await this.call(
        this.api.listInventoryImportRows(
          {
            id: preview.id,
            status: filter === 'choose' ? 'CHOOSE_PRINTING' : filter === 'unmatched' ? 'UNMATCHED' : undefined,
            page,
            size: ROWS_PAGE,
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.rows.set(reset ? (result.items ?? []) : [...this.rows(), ...(result.items ?? [])]);
      this.rowsTotal.set(result.totalItems ?? 0);
      this.rowsPage.set(page);
    } catch (error) {
      this.rowsError.set(true);
      this.expired(error);
    } finally {
      this.rowsLoading.set(false);
    }
  }

  protected state(row: InventoryImportRow): RowState {
    return rowState(row);
  }

  protected name(row: InventoryImportRow): string {
    return rowName(row);
  }

  protected line(row: InventoryImportRow): string {
    return fileLine(row);
  }

  protected why(row: InventoryImportRow): string {
    return unmatchedWhy(row);
  }

  protected image(row: InventoryImportRow): string | null {
    return printingImageUrl(row.printing) ?? row.card?.imageUrl ?? null;
  }

  protected code(printing: PrintingSummary | null | undefined): string {
    return printingCode(printing);
  }

  protected sectionHidden(key: string): boolean {
    return this.hidden().has(key as Section);
  }

  protected toggleHidden(key: string): void {
    const next = new Set(this.hidden());
    if (next.has(key as Section)) {
      next.delete(key as Section);
    } else {
      next.add(key as Section);
    }
    this.hidden.set(next);
  }

  /** The printings a row may take (its file narrowed them to `suggestedPrintingIds`). */
  protected rowPrintings(row: InventoryImportRow): PrintingSummary[] {
    const all = row.card ? (this.printings()[row.card.id] ?? []) : [];
    const suggested = new Set(row.suggestedPrintingIds);
    const narrowed = suggested.size ? all.filter((printing) => suggested.has(printing.id ?? '')) : all;
    return [...narrowed].sort((a, b) => (b.setReleaseDate ?? '').localeCompare(a.setReleaseDate ?? ''));
  }

  protected newest(row: InventoryImportRow): string | null {
    return this.rowPrintings(row)[0]?.id ?? null;
  }

  /** Loads a card's printings when its menu opens. */
  async loadPrintings(row: InventoryImportRow): Promise<void> {
    const cardId = row.card?.id;
    if (!cardId || this.printings()[cardId]) {
      return;
    }
    try {
      const card = await this.call(this.catalog.getCard({ id: cardId }, 'body', false, { context: silentErrors() }));
      this.printings.update((map) => ({ ...map, [cardId]: card.printings ?? [] }));
    } catch {
      this.printings.update((map) => ({ ...map, [cardId]: [] }));
    }
  }

  protected setPrinting(row: InventoryImportRow, printing: PrintingSummary): Promise<void> {
    return this.patchRow(row, { printingId: printing.id ?? null });
  }

  protected step(row: InventoryImportRow, direction: 1 | -1): Promise<void> {
    const quantity = Math.min(9999, Math.max(1, row.quantity + direction));
    return quantity === row.quantity ? Promise.resolve() : this.patchRow(row, { quantity });
  }

  protected include(row: InventoryImportRow, included: boolean): Promise<void> {
    return this.patchRow(row, { included });
  }

  async includeSection(key: string, include: boolean): Promise<void> {
    const preview = this.preview();
    if (!preview) {
      return;
    }
    const body =
      key === 'main' ? { includeMain: include } : key === 'extra' ? { includeExtra: include } : { includeSide: include };
    this.working.set(true);
    try {
      this.preview.set(
        await this.call(
          this.api.updateInventoryImport({ id: preview.id, updateInventoryImportRequest: body }, 'body', false, {
            context: silentErrors(),
          }),
        ),
      );
      await this.loadRows(true);
    } catch (error) {
      this.fail(error);
    } finally {
      this.working.set(false);
    }
  }

  async useNewest(): Promise<void> {
    const preview = this.preview();
    if (!preview) {
      return;
    }
    this.working.set(true);
    try {
      const response = await this.call(
        this.api.bulkUpdateInventoryImport(
          {
            id: preview.id,
            bulkInventoryImportRequest: {
              action: 'USE_MOST_RECENT_PRINTING' as BulkInventoryImportRequest['action'],
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.preview.set(response.preview);
      await this.loadRows(true);
    } catch (error) {
      this.fail(error);
    } finally {
      this.working.set(false);
    }
  }

  async commit(): Promise<void> {
    const preview = this.preview();
    if (!preview || this.blocked()) {
      return;
    }
    this.phase.set('committing');
    this.problem.set(null);
    try {
      let result = preview;
      // A commit cut into chunks answers COMMITTING: commit again to finish (idempotent).
      for (let attempt = 0; attempt < 50; attempt++) {
        result = await this.call(
          this.api.commitInventoryImport(
            { id: preview.id, commitInventoryImportRequest: { skipUnresolved: false } },
            'body',
            false,
            { context: silentErrors().set(SKIP_LIMIT_DIALOG, true) },
          ),
        );
        if (result.status === 'COMMITTED') {
          break;
        }
      }
      this.unmatchedDone.set(this.rows().filter((row) => row.status === 'UNMATCHED'));
      if (this.filter() !== 'all' || this.rows().length < this.rowsTotal()) {
        await this.loadUnmatched(preview.id);
      }
      this.preview.set(result);
      this.phase.set(result.status === 'COMMITTED' ? 'done' : 'check');
    } catch (error) {
      this.phase.set('check');
      this.fail(error);
    }
  }

  async discard(): Promise<void> {
    const preview = this.preview();
    if (preview) {
      try {
        await this.call(this.api.deleteInventoryImport({ id: preview.id }, 'body', false, { context: silentErrors() }));
      } catch {
        // An expired or purged preview is gone anyway.
      }
    }
    this.reset();
  }

  /** "Import another file". */
  protected reset(): void {
    this.preview.set(null);
    this.rows.set([]);
    this.problem.set(null);
    this.fileName.set(null);
    this.fileSize.set(null);
    this.pasted.set('');
    this.phase.set('source');
  }

  /** "Go to my inventory": sorted by Recently added (the new cards first). */
  protected goToInventory(): void {
    void this.router.navigate(['/inventory'], { queryParams: { sort: null, dir: null, tab: null } });
  }

  protected fileMeta(): string {
    const size = this.fileSize();
    return [this.info[this.choice()].label, size !== null ? formatBytes(size) : null].filter(Boolean).join(' · ');
  }

  protected isBusy(row: InventoryImportRow): boolean {
    return this.busyRows().has(row.id);
  }

  private async patchRow(
    row: InventoryImportRow,
    patch: { printingId?: string | null; quantity?: number; included?: boolean },
  ): Promise<void> {
    const preview = this.preview();
    if (!preview) {
      return;
    }
    this.busyRows.set(new Set([...this.busyRows(), row.id]));
    try {
      const change = await this.call(
        this.api.updateInventoryImportRow(
          { id: preview.id, rowId: row.id, updateInventoryImportRowRequest: patch },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.preview.set(change.preview);
      this.rows.update((rows) => rows.map((candidate) => (candidate.id === row.id ? change.row : candidate)));
    } catch (error) {
      this.fail(error);
    } finally {
      const next = new Set(this.busyRows());
      next.delete(row.id);
      this.busyRows.set(next);
    }
  }

  private async loadUnmatched(id: string): Promise<void> {
    try {
      const result = await this.call(
        this.api.listInventoryImportRows({ id, status: 'UNMATCHED', size: ROWS_PAGE }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.unmatchedDone.set(result.items ?? []);
    } catch {
      // Done still says how many were added.
    }
  }

  private fail(error: unknown): void {
    if (this.expired(error)) {
      return;
    }
    this.problem.set(importRefusal(error as ApiError, this.choice()));
  }

  /** A preview that expired (410) goes back to the source column with words. */
  private expired(error: unknown): boolean {
    const apiError = error as ApiError;
    if (apiError?.errorCode === 'IMPORT_EXPIRED' || apiError?.status === 410) {
      this.reset();
      this.problem.set(importRefusal(apiError, this.choice()));
      return true;
    }
    return false;
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}
