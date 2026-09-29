import { Injectable, Injector, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiError } from '../http/api-error';
import { friendlyMessage } from '../http/api-error-messages';
import { LimitReachedInfo, limitReachedInfo } from './limit-reached';

/**
 * Opens the limit-reached dialog for a 429 `LIMIT_REACHED` answer. The dialog (and Material's
 * dialog module) is a lazy chunk so the initial bundle stays small. Only one dialog is open at a
 * time: further errors while it is open just update {@link last}. If the chunk cannot load, a
 * snack bar still tells the collector what happened: a limit is never a silent failure.
 */
@Injectable({ providedIn: 'root' })
export class LimitReachedService {
  private readonly injector = inject(Injector);
  private readonly snackBar = inject(MatSnackBar);
  private readonly lastState = signal<LimitReachedInfo | null>(null);
  private opening = false;

  /** The most recent limit that was reached. */
  readonly last = this.lastState.asReadonly();

  show(error: ApiError): void {
    const info = limitReachedInfo(error);
    this.lastState.set(info);
    if (this.opening) {
      return;
    }
    this.opening = true;
    import('./limit-reached-dialog.component')
      .then(({ openLimitReachedDialog }) => {
        openLimitReachedDialog(this.injector, info)
          .afterClosed()
          .subscribe(() => (this.opening = false));
      })
      .catch(() => {
        this.opening = false;
        this.snackBar.open(friendlyMessage(error), 'OK', { duration: 8000 });
      });
  }
}
