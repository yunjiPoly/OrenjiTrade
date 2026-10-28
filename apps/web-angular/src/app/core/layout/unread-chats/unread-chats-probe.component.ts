import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { MessagingService } from '@orenji/api-client';
import { Subject, debounceTime, firstValueFrom, merge } from 'rxjs';
import { SessionService } from '../../auth/session.service';
import { silentErrors } from '../../http/http-context';
import { RealtimeService } from '../../realtime/realtime.service';
import { UnreadChats, inboxUnread } from './unread-chats';

/** The first page of the inbox the badge counts (the phone counts its first page too). */
export const UNREAD_PAGE = 50;
/** Pause before re-reading after a message or a read receipt (several arrive together). */
export const UNREAD_REFRESH_MS = 800;

/**
 * Reads the unread chats for the Messages badge while a collector is signed in: once when the
 * account is ready, again shortly after every new message or read receipt and after each
 * reconnection of the realtime channel. Renders nothing. Errors keep the last count.
 */
@Component({
  selector: 'app-unread-chats-probe',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnreadChatsProbeComponent {
  private readonly api = inject(MessagingService);
  private readonly session = inject(SessionService);
  private readonly realtime = inject(RealtimeService);
  private readonly unread = inject(UnreadChats);
  private readonly refresh$ = new Subject<void>();
  private readonly ready = computed(() => this.session.status() === 'ready');
  private generation = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    effect(() => {
      const ready = this.ready();
      untracked(() => {
        this.generation++;
        if (ready) {
          void this.read();
        } else {
          this.unread.set(0);
        }
      });
    });
    const subscription = merge(
      this.realtime.messages$,
      this.realtime.receipts$,
      this.realtime.resync$,
      this.refresh$,
    )
      .pipe(debounceTime(UNREAD_REFRESH_MS))
      .subscribe(() => {
        if (this.ready()) {
          void this.read();
        }
      });
    destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  private async read(): Promise<void> {
    const generation = this.generation;
    try {
      const page = await firstValueFrom(
        this.api.listConversations({ limit: UNREAD_PAGE }, 'body', false, {
          context: silentErrors(),
        }),
      );
      if (generation === this.generation && this.ready()) {
        this.unread.set(inboxUnread(page.items ?? []));
      }
    } catch {
      // Keep the last count: the badge is a hint, the inbox itself shows its own error.
    }
  }
}
