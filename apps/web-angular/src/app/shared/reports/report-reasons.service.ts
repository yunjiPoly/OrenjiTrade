import { Injectable, inject, signal } from '@angular/core';
import { ReportReasonOption, ReportsService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/http/api-error';
import { silentErrors } from '../../core/http/http-context';

/**
 * The report reasons of `GET /public/report-reasons` (server order = dialog order), fetched once
 * per session and shared by every "Report collector" dialog. A failed load can be retried.
 */
@Injectable({ providedIn: 'root' })
export class ReportReasonsService {
  private readonly api = inject(ReportsService);
  private pending: Promise<void> | null = null;

  private readonly reasonsState = signal<ReportReasonOption[] | null>(null);
  private readonly errorState = signal<ApiError | null>(null);

  /** The reasons, `null` until loaded. */
  readonly reasons = this.reasonsState.asReadonly();
  readonly error = this.errorState.asReadonly();

  /** Loads the reasons unless they are already there (concurrent callers share one request). */
  load(): Promise<void> {
    if (this.reasonsState()) {
      return Promise.resolve();
    }
    if (!this.pending) {
      this.errorState.set(null);
      this.pending = firstValueFrom(
        this.api.listReportReasons('body', false, { context: silentErrors() }),
      )
        .then((reasons) => this.reasonsState.set(reasons ?? []))
        .catch((error: unknown) => this.errorState.set(toApiError(error)))
        .finally(() => (this.pending = null));
    }
    return this.pending;
  }
}
