import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MetaResponse, MetaService } from '@orenji/api-client';
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component';
import { ApiError, toApiError } from '../../http/api-error';
import { silentErrors } from '../../http/http-context';

/**
 * Shows "API v{version} - {environment}" from `GET /api/v1/meta` through the generated client.
 * Background probe: it never toasts and never breaks the page when the API is down.
 */
@Component({
  selector: 'app-api-version',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule, SkeletonComponent],
  template: `
    <span class="api-version" aria-live="polite">
      @if (loading()) {
        <span class="visually-hidden">Loading API version</span>
        <app-skeleton width="9rem" height="0.8rem" />
      } @else if (meta(); as meta) {
        <span class="mono">API v{{ meta.version }} - {{ meta.environment }}</span>
      } @else if (error(); as error) {
        <span class="api-version__error">
          <mat-icon inline aria-hidden="true">cloud_off</mat-icon>
          API unavailable
        </span>
        <button
          matIconButton
          type="button"
          class="api-version__retry"
          aria-label="Retry loading the API version"
          [matTooltip]="error.message"
          (click)="load()"
        >
          <mat-icon>refresh</mat-icon>
        </button>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .api-version {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
      min-height: 24px;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);
    }
    .api-version__error {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-1);
    }
    .api-version__retry {
      --mat-icon-button-state-layer-size: 28px;
      --mat-icon-button-icon-size: 16px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiVersionComponent {
  private readonly metaService = inject(MetaService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly meta = signal<MetaResponse | null>(null);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.metaService
      .getMeta('body', false, { context: silentErrors() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (meta) => {
          this.meta.set(meta);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.meta.set(null);
          this.error.set(toApiError(err));
          this.loading.set(false);
        },
      });
  }
}
