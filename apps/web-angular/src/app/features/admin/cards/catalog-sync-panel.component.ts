import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AdminCatalogService,
  CatalogSyncRequestModeEnum,
  CatalogSyncRun,
  GameResponse,
} from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../core/http/api-error';
import { friendlyMessage } from '../../../core/http/api-error-messages';
import { silentErrors } from '../../../core/http/http-context';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { ErrorStateComponent } from '../../../shared/ui/error-state/error-state.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 40;
const RUNS_PAGE_SIZE = 10;

export function isFinished(run: CatalogSyncRun | null | undefined): boolean {
  return run?.status === 'SUCCEEDED' || run?.status === 'FAILED';
}

/** Catalog import: queue a sync from a provider (mock locally) and follow the runs. */
@Component({
  selector: 'app-catalog-sync-panel',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    RelativeTimePipe,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  template: `
    <section class="admin-card sync" aria-labelledby="sync-title">
      <h2 id="sync-title">Catalog sync</h2>
      <p class="admin-muted">
        Imports sets, cards and printings from a provider. Runs are idempotent: unchanged rows are
        not rewritten.
      </p>
      <form class="sync__form" [formGroup]="form" (ngSubmit)="run()">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Game</mat-label>
          <mat-select formControlName="gameSlug">
            @for (game of games(); track game.slug) {
              <mat-option [value]="game.slug">{{ game.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Provider</mat-label>
          <mat-select formControlName="provider">
            @for (provider of providerOptions(); track provider) {
              <mat-option [value]="provider">{{ provider }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Mode</mat-label>
          <mat-select formControlName="mode">
            <mat-option value="FULL">Full</mat-option>
            <mat-option value="INCREMENTAL">Incremental</mat-option>
          </mat-select>
        </mat-form-field>
        <button matButton="filled" type="submit" [disabled]="form.invalid || running()">
          <mat-icon aria-hidden="true">sync</mat-icon>
          {{ running() ? 'Syncing…' : 'Run sync' }}
        </button>
      </form>

      <h3 class="sync__runs-title">Recent runs</h3>
      @if (runsError(); as error) {
        <app-error-state
          compact
          title="Sync runs could not load"
          [message]="message(error)"
          (retry)="loadRuns()"
        />
      } @else if (runs(); as runs) {
        @if (runs.length === 0) {
          <p class="admin-muted">No sync has run yet.</p>
        } @else {
          <div class="sync__table-wrap">
            <table class="sync__table" aria-label="Catalog sync runs">
              <thead>
                <tr>
                  <th scope="col">Requested</th>
                  <th scope="col">Game</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Status</th>
                  <th scope="col">Sets / cards / printings</th>
                </tr>
              </thead>
              <tbody>
                @for (run of runs; track run.id) {
                  <tr>
                    <td>
                      {{ run.createdAt | relativeTime }}
                      <span class="visually-hidden">({{ run.createdAt | date: 'medium' }})</span>
                    </td>
                    <td class="mono">{{ run.game }}</td>
                    <td class="mono">{{ run.provider }}</td>
                    <td>{{ run.mode === 'INCREMENTAL' ? 'Incremental' : 'Full' }}</td>
                    <td>
                      <span class="sync__status" [attr.data-status]="run.status">
                        {{ statusLabel(run.status) }}
                      </span>
                      @if (run.error) {
                        <span class="sync__error">{{ run.error }}</span>
                      }
                    </td>
                    <td class="sync__counts">
                      {{ run.setsUpserted ?? 0 }} / {{ run.cardsUpserted ?? 0 }} /
                      {{ run.printingsUpserted ?? 0 }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      } @else {
        <app-skeleton variant="list" lines="3" />
      }
    </section>
  `,
  styleUrls: ['../shared/admin-page.scss'],
  styles: `
    .sync__form {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--spacing-3);
      margin: var(--spacing-3) 0 var(--spacing-5);
    }
    .sync__form mat-form-field {
      flex: 1 1 160px;
      max-width: 220px;
    }
    .sync__runs-title {
      margin-bottom: var(--spacing-2);
      font-size: var(--font-size-md);
    }
    .sync__table-wrap {
      overflow-x: auto;
    }
    .sync__table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--font-size-sm);
    }
    .sync__table th,
    .sync__table td {
      padding: var(--spacing-2);
      border-bottom: 1px solid var(--color-border);
      text-align: left;
      white-space: nowrap;
    }
    .sync__table th {
      color: var(--color-text-muted);
      font-size: var(--font-size-xs);
    }
    .sync__status {
      --tone: var(--color-status-hidden);
      padding: 0 var(--spacing-2);
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--tone) 16%, var(--color-surface));
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-semibold);
    }
    .sync__status[data-status='SUCCEEDED'] {
      --tone: var(--color-success);
    }
    .sync__status[data-status='FAILED'] {
      --tone: var(--color-danger);
    }
    .sync__status[data-status='RUNNING'],
    .sync__status[data-status='QUEUED'] {
      --tone: var(--color-info);
    }
    .sync__error {
      display: block;
      color: var(--color-danger);
      font-size: var(--font-size-xs);
      white-space: normal;
    }
    .sync__counts {
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogSyncPanelComponent {
  private readonly api = inject(AdminCatalogService);
  private readonly snackBar = inject(MatSnackBar);
  private destroyed = false;

  protected readonly games = signal<GameResponse[]>([]);
  protected readonly providers = signal<Record<string, string[]>>({});
  protected readonly runs = signal<CatalogSyncRun[] | null>(null);
  protected readonly runsError = signal<ApiError | null>(null);
  protected readonly running = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    gameSlug: ['', Validators.required],
    provider: ['', Validators.required],
    mode: [CatalogSyncRequestModeEnum.Full as CatalogSyncRequestModeEnum, Validators.required],
  });
  private readonly selectedGame = toSignal(this.form.controls.gameSlug.valueChanges, {
    initialValue: '',
  });
  protected readonly providerOptions = computed(() => {
    const game = this.selectedGame();
    return Object.entries(this.providers())
      .filter(([, games]) => !game || games.includes(game))
      .map(([provider]) => provider);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
    void this.loadOptions();
    void this.loadRuns();
  }

  protected message(error: ApiError): string {
    return friendlyMessage(error);
  }

  protected statusLabel(status: string | undefined): string {
    switch (status) {
      case 'SUCCEEDED':
        return 'Succeeded';
      case 'FAILED':
        return 'Failed';
      case 'RUNNING':
        return 'Running';
      case 'QUEUED':
        return 'Queued';
      default:
        return status ?? '—';
    }
  }

  protected async loadRuns(): Promise<void> {
    this.runsError.set(null);
    try {
      const page = await firstValueFrom(
        this.api.listCatalogSyncRuns({ page: 0, size: RUNS_PAGE_SIZE }, 'body', false, {
          context: silentErrors(),
        }),
      );
      this.runs.set(page.items ?? []);
    } catch (error) {
      this.runsError.set(toApiError(error));
    }
  }

  protected async run(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    const { gameSlug, provider, mode } = this.form.getRawValue();
    this.running.set(true);
    try {
      let run = await firstValueFrom(
        this.api.requestCatalogSync(
          { catalogSyncRequest: { gameSlug, provider, mode } },
          'body',
          false,
          { context: silentErrors() },
        ),
      );
      this.snackBar.open(`Sync queued for ${gameSlug}.`, 'OK', { duration: 3000 });
      await this.loadRuns();
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS && !isFinished(run); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        if (this.destroyed) {
          return;
        }
        run = await firstValueFrom(
          this.api.getCatalogSyncRun({ id: run.id ?? '' }, 'body', false, {
            context: silentErrors(),
          }),
        );
      }
      await this.loadRuns();
      if (isFinished(run)) {
        this.snackBar.open(
          run.status === 'SUCCEEDED'
            ? `Sync finished: ${run.cardsUpserted ?? 0} cards and ${run.printingsUpserted ?? 0} printings updated.`
            : `Sync failed: ${run.error ?? 'see the run for details'}.`,
          'OK',
          { duration: 6000 },
        );
      }
    } catch (error) {
      this.snackBar.open(friendlyMessage(toApiError(error)), 'OK', { duration: 6000 });
    } finally {
      this.running.set(false);
    }
  }

  private async loadOptions(): Promise<void> {
    try {
      const [games, providers] = await Promise.all([
        firstValueFrom(this.api.listAdminGames('body', false, { context: silentErrors() })),
        firstValueFrom(this.api.listCatalogProviders('body', false, { context: silentErrors() })),
      ]);
      this.games.set(games ?? []);
      this.providers.set(providers ?? {});
      const first = games?.[0]?.slug;
      if (first && !this.form.controls.gameSlug.value) {
        this.form.controls.gameSlug.setValue(first);
      }
      const provider = Object.keys(providers ?? {})[0];
      if (provider && !this.form.controls.provider.value) {
        this.form.controls.provider.setValue(provider);
      }
    } catch (error) {
      this.runsError.set(toApiError(error));
    }
  }
}
