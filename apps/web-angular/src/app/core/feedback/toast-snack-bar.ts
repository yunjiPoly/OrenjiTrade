import { Injectable, inject } from '@angular/core';
import type { MatSnackBarConfig } from '@angular/material/snack-bar';
import { ToastRef, ToastService } from './toast.service';

/**
 * Stands in for `MatSnackBar` across the app (`app.config.ts`): every `snackBar.open(message,
 * action, config)` becomes one of the shell's toasts (spec 4.8), with the toast's durations
 * (6 s, 10 s with an Undo) and the error look for `panelClass: 'app-toast--error'`. Only `open`
 * and the returned `onAction()` / `afterDismissed()` / `dismiss()` are used by the app.
 */
@Injectable({ providedIn: 'root' })
export class ToastSnackBar {
  private readonly toasts = inject(ToastService);

  open(message: string, action?: string, config?: MatSnackBarConfig): ToastRef {
    const panel = config?.panelClass;
    const classes = Array.isArray(panel) ? panel : panel ? [panel] : [];
    const error = classes.includes('app-toast--error');
    return this.toasts.show({
      title: message,
      action: action ?? null,
      tone: error ? 'error' : 'success',
      duration: config?.duration,
    });
  }

  dismiss(): void {
    for (const toast of this.toasts.toasts()) {
      this.toasts.close(toast.id, false);
    }
  }
}
