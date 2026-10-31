import { A11yModule } from '@angular/cdk/a11y';
import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import {
  AdminCatalogService,
  CardImageCacheStatus,
  CatalogGameSummary,
  CatalogImportReport,
  CatalogSyncRequestImageModeEnum,
  CatalogSyncRequestModeEnum,
  CatalogSyncRun,
  GameResponse,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/feedback/toast.service';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { AdminIconComponent } from '../console/admin-icon.component';
import { RECORDED, runConsoleAction } from '../console/console-actions';
import { gameName } from '../console/console-labels';
import { GameBadgeComponent } from '../console/game-badge.component';
import { loadInto, section } from '../console/section';
import { ClearImagesDialogComponent, ClearImagesDialogData } from './clear-images-dialog.component';
import {
  IMAGE_MODES,
  ImageMode,
  MODE_HINTS,
  PHASES,
  durationText,
  etiquette,
  gameImages,
  gameImagesLine,
  imageLimitError,
  imagesLabel,
  isFinished,
  mbText,
  meterSegments,
  reportSections,
  runStatus,
  sourceHint,
  sourceName,
  sourceNote,
} from './card-data';

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 80;
const RUNS = 10;

/** The sync form (board A12's "Run a sync"). */
interface SyncForm {
  game: string;
  source: string;
  mode: 'INCREMENTAL' | 'FULL';
  images: ImageMode;
  limit: string;
}

/**
 * `/admin/card-data` (spec 15.6, board A12): today's catalog sync panel as a page. "Games and
 * sources" (cards, the source, the last sync per game), "Run a sync" (game, source, mode and the
 * images mode with the provider etiquette line), the card image cache (the meter by game, the
 * status counts, Check the cache, Clear a game's images… confirmed, the 5 GB cap line) and the
 * recent runs with their phase and a Report drawer. Agents and the E2E database never call a
 * provider: locally the only source is the mock one (ADR 0021).
 */
@Component({
  selector: 'app-admin-card-data-page',
  imports: [
    A11yModule,
    DatePipe,
    AdminIconComponent,
    ErrorStateComponent,
    GameBadgeComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-card-data-page.component.html',
  styleUrls: [
    '../console/console-page.scss',
    '../console/console-controls.scss',
    '../console/console-table.scss',
    '../console/console-drawer.scss',
    './admin-card-data-page.component.scss',
  ],
  host: { '(document:keydown.escape)': 'onEscape($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCardDataPageComponent {
  private readonly api = inject(AdminCatalogService);
  private readonly toasts = inject(ToastService);
  private readonly dialog = inject(MatDialog);
  private readonly document = inject(DOCUMENT);
  private destroyed = false;

  protected readonly games = section<CatalogGameSummary[]>();
  protected readonly adminGames = signal<GameResponse[]>([]);
  protected readonly cache = section<CardImageCacheStatus>();
  protected readonly runs = section<CatalogSyncRun[]>();
  protected readonly form = signal<SyncForm>({
    game: '',
    source: '',
    mode: 'INCREMENTAL',
    images: 'REFERENCED',
    limit: '2000',
  });
  protected readonly tried = signal(false);
  protected readonly running = signal(false);
  protected readonly checking = signal(false);
  protected readonly report = signal<CatalogSyncRun | null>(null);
  protected readonly reportData = signal<CatalogImportReport | null>(null);
  protected readonly reportError = signal<ApiError | null>(null);
  private opener: HTMLElement | null = null;

  protected readonly imageModes = IMAGE_MODES;
  protected readonly phases = PHASES;
  protected readonly modeHints = MODE_HINTS;
  protected readonly sourceName = sourceName;
  protected readonly sourceNote = sourceNote;
  protected readonly sourceHint = sourceHint;
  protected readonly etiquette = etiquette;
  protected readonly imagesLabel = imagesLabel;
  protected readonly runStatus = runStatus;
  protected readonly mbText = mbText;
  protected readonly gameImagesLine = gameImagesLine;
  protected readonly durationText = durationText;
  protected readonly reportSections = reportSections;

  /** Games with a source, which a sync can run on. */
  protected readonly syncable = computed(() =>
    (this.games().data ?? []).filter((game) => game.providers.length > 0),
  );
  protected readonly waiting = computed(() =>
    (this.games().data ?? []).filter((game) => game.providers.length === 0),
  );
  /** "One Piece and Riftbound have no source yet." */
  protected readonly waitingLine = computed(() => {
    const names = this.waiting().map((game) => this.name(game.game));
    if (names.length === 0) {
      return null;
    }
    const list =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    return `${list} ${names.length === 1 ? 'has' : 'have'} no source yet.`;
  });
  protected readonly isFinishedRun = isFinished;
  protected readonly sources = computed(
    () => this.syncable().find((game) => game.game === this.form().game)?.providers ?? [],
  );
  protected readonly limitError = computed(() =>
    this.form().images === 'LIMIT' ? imageLimitError(this.form().limit) : null,
  );
  protected readonly segments = computed(() => {
    const status = this.cache().data;
    return status ? meterSegments(status) : [];
  });
  protected readonly imageRows = computed(() => {
    const status = this.cache().data;
    return status ? gameImages(status) : [];
  });
  protected readonly usedPercent = computed(() => {
    const status = this.cache().data;
    return status ? Math.round((status.usedMb / Math.max(1, status.limitMb)) * 100) : 0;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    void this.loadGames();
    void this.loadCache();
    void this.loadRuns();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected name(slug: string | null | undefined): string {
    return (
      gameName(slug) ??
      this.adminGames().find((game) => game.slug === slug)?.shortName ??
      slug ??
      ''
    );
  }

  protected async loadGames(): Promise<void> {
    const [games] = await Promise.all([
      loadInto(this.games, this.api.listCatalogGames('body', false, { context: silentErrors() })),
      firstValueFrom(this.api.listAdminGames('body', false, { context: silentErrors() }))
        .then((list) => this.adminGames.set(list ?? []))
        .catch(() => undefined),
    ]);
    const first = (games ?? []).find((game) => game.providers.length > 0);
    if (first && !this.form().game) {
      this.pickGame(first.game);
    }
  }

  protected loadCache(): Promise<unknown> {
    return loadInto(
      this.cache,
      this.api.getCardImageCacheStatus('body', false, { context: silentErrors() }),
    );
  }

  protected loadRuns(): Promise<unknown> {
    return loadInto(this.runs, async () => {
      const page = await firstValueFrom(
        this.api.listCatalogSyncRuns({ page: 0, size: RUNS }, 'body', false, {
          context: silentErrors(),
        }),
      );
      return page.items ?? [];
    });
  }

  protected pickGame(game: string): void {
    const providers = this.syncable().find((g) => g.game === game)?.providers ?? [];
    this.form.update((form) => ({
      ...form,
      game,
      source: providers.includes(form.source) ? form.source : (providers[0] ?? ''),
    }));
  }

  /** "Sync…" on a game's row: the form picks it and takes the focus. */
  protected syncGame(game: string): void {
    this.pickGame(game);
    this.document.getElementById('cd-game')?.focus();
  }

  protected setField<K extends keyof SyncForm>(key: K, value: SyncForm[K]): void {
    this.form.update((form) => ({ ...form, [key]: value }));
  }

  protected onSelect(key: 'game' | 'source', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (key === 'game') {
      this.pickGame(value);
    } else {
      this.setField('source', value);
    }
  }

  protected onLimit(event: Event): void {
    this.setField('limit', (event.target as HTMLInputElement).value);
  }

  /** Arrows move a radio group (segmented control) and pick, as the boards' radios do. */
  protected radioKey<T extends string>(
    event: KeyboardEvent,
    values: readonly T[],
    current: T,
    pick: (value: T) => void,
    idOf: (value: T) => string,
  ): void {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const i = values.indexOf(current);
    let j = i;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') j = (i + 1) % values.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      j = (i - 1 + values.length) % values.length;
    if (event.key === 'Home') j = 0;
    if (event.key === 'End') j = values.length - 1;
    pick(values[j]);
    setTimeout(() => this.document.getElementById(idOf(values[j]))?.focus());
  }

  protected readonly modes = ['INCREMENTAL', 'FULL'] as const;
  protected readonly imageIds = IMAGE_MODES.map((mode) => mode.id);
  protected readonly pickMode = (mode: 'INCREMENTAL' | 'FULL') => this.setField('mode', mode);
  protected readonly pickImages = (mode: ImageMode) => this.setField('images', mode);
  protected readonly modeId = (mode: string) => `cd-mode-${mode}`;
  protected readonly imagesId = (mode: string) => `cd-images-${mode}`;

  protected async runSync(): Promise<void> {
    this.tried.set(true);
    const form = this.form();
    if (this.running() || !form.game || !form.source) {
      return;
    }
    if (this.limitError()) {
      this.document.getElementById('cd-limit')?.focus();
      return;
    }
    this.running.set(true);
    try {
      const queued = await runConsoleAction(
        this.toasts,
        this.api.requestCatalogSync(
          {
            catalogSyncRequest: {
              gameSlug: form.game,
              provider: form.source,
              mode: form.mode as CatalogSyncRequestModeEnum,
              imageMode: form.images as CatalogSyncRequestImageModeEnum,
              ...(form.images === 'LIMIT' ? { imageLimit: Number(form.limit) } : {}),
            },
          },
          'body',
          false,
          { context: silentErrors() },
        ),
        `Sync of ${this.name(form.game)} queued.`,
        `An import of ${this.name(form.game)} is already queued or running.`,
      );
      if (!queued) {
        return;
      }
      this.tried.set(false);
      await this.loadRuns();
      await this.follow(queued);
    } finally {
      this.running.set(false);
    }
  }

  /** Follows a run until it ends (the table shows its phase), then reloads the page's parts. */
  private async follow(run: CatalogSyncRun): Promise<void> {
    let current = run;
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS && !isFinished(current); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (this.destroyed) {
        return;
      }
      try {
        current = await firstValueFrom(
          this.api.getCatalogSyncRun({ id: current.id ?? '' }, 'body', false, {
            context: silentErrors(),
          }),
        );
      } catch {
        break;
      }
      this.runs.update((s) => ({
        ...s,
        data: (s.data ?? []).map((r) => (r.id === current.id ? current : r)),
      }));
      if (this.report()?.id === current.id) {
        this.report.set(current);
        this.reportData.set(current.report ?? null);
      }
    }
    if (isFinished(current)) {
      this.toasts.show(
        current.status === 'SUCCEEDED'
          ? {
              title: `Sync of ${this.name(current.game)} finished: ${(current.cardsUpserted ?? 0).toLocaleString('en-US')} cards and ${(current.printingsUpserted ?? 0).toLocaleString('en-US')} printings written.`,
              sub: RECORDED,
            }
          : {
              title: `Sync of ${this.name(current.game)} failed: ${current.error ?? 'see its report'}.`,
              tone: 'error',
            },
      );
      await Promise.all([this.loadRuns(), this.loadGames(), this.loadCache()]);
    }
  }

  protected async check(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    const result = await runConsoleAction(
      this.toasts,
      this.api.reconcileCardImageCache('body', false, { context: silentErrors() }),
      'The card image cache was checked.',
    );
    this.checking.set(false);
    if (result) {
      await this.loadCache();
    }
  }

  protected async clear(event: Event): Promise<void> {
    const opener = event.currentTarget as HTMLElement;
    const status = this.cache().data;
    const data: ClearImagesDialogData = {
      games: (this.games().data ?? []).map((game) => ({
        slug: game.game,
        name: this.name(game.game),
        cached: this.imageRows().find((row) => row.game === game.game)?.cached ?? 0,
        mb: this.imageRows().find((row) => row.game === game.game)?.mb ?? 0,
      })),
      totalMb: status?.usedMb ?? 0,
    };
    const ref = this.dialog.open(ClearImagesDialogComponent, {
      data,
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
      autoFocus: 'first-tabbable',
      restoreFocus: false,
    });
    const game = await firstValueFrom(ref.afterClosed());
    if (!game) {
      setTimeout(() => opener.focus());
      return;
    }
    const result = await runConsoleAction(
      this.toasts,
      this.api.clearCardImageCache({ cardImageCacheClearRequest: { game } }, 'body', false, {
        context: silentErrors(),
      }),
      `${this.name(game)} card images cleared.`,
    );
    setTimeout(() => opener.focus());
    if (result) {
      await this.loadCache();
    }
  }

  protected async openReport(run: CatalogSyncRun, event: Event): Promise<void> {
    this.opener = event.currentTarget as HTMLElement;
    this.report.set(run);
    this.reportData.set(run.report ?? null);
    this.reportError.set(null);
    if (!run.report && run.id) {
      try {
        this.reportData.set(
          await firstValueFrom(
            this.api.getCatalogSyncRunReport({ id: run.id }, 'body', false, {
              context: silentErrors(),
            }),
          ),
        );
      } catch (error) {
        this.reportError.set(toApiError(error));
      }
    }
  }

  protected closeReport(): void {
    this.report.set(null);
    const opener = this.opener;
    this.opener = null;
    setTimeout(() => opener?.focus());
  }

  protected onEscape(event: Event): void {
    if (!this.report() || event.defaultPrevented) {
      return;
    }
    if (this.document.querySelector('.cdk-overlay-container [role="dialog"]')) {
      return;
    }
    event.preventDefault();
    this.closeReport();
  }

  protected phaseIndex(run: CatalogSyncRun): number {
    if (run.status === 'SUCCEEDED') {
      return PHASES.length - 1;
    }
    return PHASES.findIndex((phase) => phase.id === run.phase);
  }
}
