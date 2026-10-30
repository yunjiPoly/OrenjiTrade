import { Injectable, inject, signal } from '@angular/core';
import { BinderResponse, BindersService, NotificationResponse } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ToastService } from '../feedback/toast.service';
import { silentErrors } from '../http/http-context';
import { NotificationCenter } from './notification-center.service';
import { ReminderState, reminderBinderId, reminderState } from './notification-rows';

/**
 * The freshness reminders answered in place (spec 12, board W24): "Still have them" confirms the
 * binder (`POST /binders/{id}/confirm`) and the row says "Confirmed. They stay in search.";
 * "Review the binder" opens Inventory on it. The state of each row comes from your binders (`GET
 * /binders`, read when a list with a reminder opens). Shared by the bell and `/notifications`.
 */
@Injectable({ providedIn: 'root' })
export class ReminderAnswers {
  private readonly api = inject(BindersService);
  private readonly auth = inject(AuthService);
  private readonly center = inject(NotificationCenter);
  private readonly toasts = inject(ToastService);

  private readonly bindersState = signal<BinderResponse[] | null>(null);
  private readonly confirmingState = signal<string | null>(null);
  private uid: string | null = null;
  private reading: Promise<void> | null = null;

  /** The notification being confirmed (its button shows the progress). */
  readonly confirming = this.confirmingState.asReadonly();
  readonly binders = this.bindersState.asReadonly();

  /** Reads your binders once per account (again with `force`). */
  load(force = false): Promise<void> {
    const uid = this.auth.user()?.uid ?? null;
    if (uid !== this.uid) {
      this.uid = uid;
      this.bindersState.set(null);
      this.reading = null;
    }
    if (!uid || (this.reading && !force)) {
      return this.reading ?? Promise.resolve();
    }
    this.reading = firstValueFrom(
      this.api.listMyBinders('body', false, { context: silentErrors() }),
    )
      .then((binders) => {
        if (uid === this.uid) {
          this.bindersState.set(binders ?? []);
        }
      })
      .catch(() => {
        // The rows keep their buttons: a confirm is harmless.
      });
    return this.reading;
  }

  state(notification: NotificationResponse): ReminderState {
    return reminderState(notification, this.bindersState());
  }

  /** "Still have them": confirms the binder and marks the reminder read. */
  async confirm(notification: NotificationResponse): Promise<boolean> {
    const binderId = reminderBinderId(notification);
    if (!binderId || this.confirmingState()) {
      return false;
    }
    this.confirmingState.set(notification.id);
    void this.center.markRead(notification);
    try {
      const updated = await firstValueFrom(
        this.api.confirmBinder({ id: binderId }, 'body', false, { context: silentErrors() }),
      );
      this.bindersState.update((binders) =>
        binders
          ? binders.map((binder) => (binder.id === updated.id ? updated : binder))
          : [updated],
      );
      return true;
    } catch {
      this.toasts.show({ title: 'The binder could not be confirmed. Try again.', tone: 'error' });
      return false;
    } finally {
      this.confirmingState.set(null);
    }
  }

  /** "Review the binder" (or the cards without one): where it opens. */
  reviewLink(notification: NotificationResponse): {
    path: string[];
    query: Record<string, string>;
  } {
    const binderId = reminderBinderId(notification);
    return binderId
      ? { path: ['/inventory'], query: { binder: binderId } }
      : { path: ['/inventory'], query: {} };
  }
}
