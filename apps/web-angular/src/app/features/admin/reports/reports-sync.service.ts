import { Injectable, signal } from '@angular/core';

/**
 * Tells the Reports list that the open report changed (assigned, noted, decided), so the list
 * reads its page again. Provided by the Reports page, read by its report panel.
 */
@Injectable()
export class ReportsSync {
  private readonly versionState = signal(0);
  readonly version = this.versionState.asReadonly();

  changed(): void {
    this.versionState.update((value) => value + 1);
  }
}
