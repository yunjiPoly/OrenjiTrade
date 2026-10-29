import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
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
import { EmptyStateComponent } from '../../../shared/ui/empty-state/empty-state.component';
import { GameMonogramComponent } from '../../../shared/ui/game-monogram/game-monogram.component';
import { ImportDoneComponent } from './import-done.component';
import { ImportHandoff, ImportSourceChoice, sourceOfFile } from './import-handoff.service';
import {
  IMPORT_SOURCES,
  ImportProblem,
  addLabel,
  doneLines,
  footerLine,
  formatBytes,
  checkSummary,
  importRefusal,
  keptLine,
  limitsLine,
  refusalBeforeUpload,
  sectionsLine,
} from './import-labels';
import { ImportRowsComponent } from './import-rows.component';
import { ImportSourceComponent } from './import-source.component';

type Phase = 'source' | 'uploading' | 'check' | 'committing' | 'done';
type RowFilter = 'all' | 'choose' | 'unmatched';

const ROWS_PAGE = 100;

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
    EmptyStateComponent,
    GameMonogramComponent,
    ImportDoneComponent,
    ImportRowsComponent,
    ImportSourceComponent,
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
  private readonly announcer = inject(LiveAnnouncer);
  private readonly document = inject(DOCUMENT);
  protected readonly games = inject(GamesStore);

  /** `?source=ydk|csv` (Add cards' menu, a dropped file). */
  readonly source = input<string | undefined>();

  protected readonly info = IMPORT_SOURCES;
  protected readonly signedIn = signal<boolean | null>(null);
  protected readonly phase = signal<Phase>('source');
  protected readonly choice = signal<ImportSourceChoice>('YDK');
  protected readonly csvGame = signal('');
  protected readonly limits = signal<InventoryImportLimits | null>(null);
  protected readonly limitsError = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly fileSize = signal<number | null>(null);
  protected readonly problem = signal<ImportProblem | null>(null);
  protected readonly preview = signal<InventoryImportResponse | null>(null);
  protected readonly rows = signal<InventoryImportRow[]>([]);
  protected readonly rowsTotal = signal(0);
  protected readonly rowsPage = signal(0);
  protected readonly rowsLoading = signal(false);
  protected readonly rowsError = signal(false);
  protected readonly filter = signal<RowFilter>('all');
  protected readonly busyRows = signal<ReadonlySet<string>>(new Set());
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
        // Only a .ydk or a .csv is handed over (spec 9.7, F10); anything else is not uploaded.
        const source = sourceOfFile(file.name);
        if (source) {
          this.choice.set(source);
          await this.upload(file);
          return;
        }
        this.problem.set({
          title: 'This is not a deck or a Collectr export',
          message: 'Choose a .ydk or a .csv file.',
        });
      }
      await this.resume();
    });
  }

  // --- source --------------------------------------------------------------------------------

  async loadLimits(): Promise<void> {
    this.limitsError.set(false);
    try {
      this.limits.set(
        await this.call(
          this.api.getInventoryImportLimits('body', false, { context: silentErrors() }),
        ),
      );
    } catch {
      this.limitsError.set(true);
    }
  }

  protected chooseSource(source: ImportSourceChoice): void {
    this.choice.set(source);
    this.problem.set(null);
  }

  protected async uploadPasted(text: string): Promise<void> {
    if (!text.trim()) {
      this.problem.set({
        title: 'Nothing to check yet',
        message: 'Paste the text of the file first.',
      });
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
          {
            source,
            file,
            game: source === 'COLLECTR_CSV' && this.csvGame() ? this.csvGame() : undefined,
          },
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
      const imports = await this.call(
        this.api.listInventoryImports('body', false, { context: silentErrors() }),
      );
      const open =
        imports.find((candidate) => candidate.status === 'COMMITTING') ??
        imports.find(
          (candidate) =>
            candidate.status === 'PENDING' && Date.parse(candidate.expiresAt) > Date.now(),
        );
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
    void this.loadRows(true).then(() => {
      // The check is read once (A2): its summary, and the focus on its heading when the chosen
      // file's button was swapped for "Choose another file".
      const summary = this.preview()?.summary;
      if (summary) {
        void this.announcer.announce(checkSummary(summary), 'polite');
      }
      this.focusIfLost('chk-title');
    });
  }

  /** Moves the focus to `id` when the control that had it was removed or swapped (A1, A2). */
  private focusIfLost(id: string, always = false): void {
    setTimeout(() => {
      const active = this.document.activeElement;
      if (!always && active && active !== this.document.body && active.isConnected) {
        return;
      }
      const target = this.document.getElementById(id);
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus();
      }
    });
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
            status:
              filter === 'choose'
                ? 'CHOOSE_PRINTING'
                : filter === 'unmatched'
                  ? 'UNMATCHED'
                  : undefined,
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

  /** Loads a card's printings when its menu opens. */
  async loadPrintings(row: InventoryImportRow): Promise<void> {
    const cardId = row.card?.id;
    if (!cardId || this.printings()[cardId]) {
      return;
    }
    try {
      const card = await this.call(
        this.catalog.getCard({ id: cardId }, 'body', false, { context: silentErrors() }),
      );
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
    if (!preview || this.working()) {
      return;
    }
    const body =
      key === 'main'
        ? { includeMain: include }
        : key === 'extra'
          ? { includeExtra: include }
          : { includeSide: include };
    this.working.set(true);
    try {
      this.preview.set(
        await this.call(
          this.api.updateInventoryImport(
            { id: preview.id, updateInventoryImportRequest: body },
            'body',
            false,
            {
              context: silentErrors(),
            },
          ),
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
    if (!preview || this.working()) {
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
      if (result.status === 'COMMITTED') {
        // Done replaces the page (A2): its heading takes the focus and is read.
        this.focusIfLost('done-title', true);
      }
    } catch (error) {
      this.phase.set('check');
      this.fail(error);
    }
  }

  async discard(): Promise<void> {
    const preview = this.preview();
    if (preview) {
      try {
        await this.call(
          this.api.deleteInventoryImport({ id: preview.id }, 'body', false, {
            context: silentErrors(),
          }),
        );
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
    this.phase.set('source');
    setTimeout(() => {
      const active = this.document.activeElement;
      if (!active || active === this.document.body || !active.isConnected) {
        this.document.querySelector<HTMLElement>('[data-testid="import-choose"]')?.focus();
      }
    });
  }

  /** "Go to my inventory": sorted by Recently added (the new cards first). */
  protected goToInventory(): void {
    void this.router.navigate(['/inventory'], {
      queryParams: { sort: null, dir: null, tab: null },
    });
  }

  protected fileMeta(): string {
    const size = this.fileSize();
    return [this.info[this.choice()].label, size !== null ? formatBytes(size) : null]
      .filter(Boolean)
      .join(' · ');
  }

  private async patchRow(
    row: InventoryImportRow,
    patch: { printingId?: string | null; quantity?: number; included?: boolean },
  ): Promise<void> {
    const preview = this.preview();
    // A row saving (or the whole check) ignores more edits: its controls stay focusable (A1).
    if (!preview || this.busyRows().has(row.id) || this.working()) {
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
      this.rows.update((rows) =>
        rows.map((candidate) => (candidate.id === row.id ? change.row : candidate)),
      );
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
        this.api.listInventoryImportRows(
          { id, status: 'UNMATCHED', size: ROWS_PAGE },
          'body',
          false,
          {
            context: silentErrors(),
          },
        ),
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
