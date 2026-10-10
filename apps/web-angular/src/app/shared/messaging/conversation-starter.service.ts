import { Injectable, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ConversationSummary, MessagingService } from '@orenji/api-client';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/http/api-error';
import { friendlyError } from '../../core/http/api-error-messages';
import { silentErrors } from '../../core/http/http-context';

/**
 * "Message" buttons (collector profile, binders, matches): opens the conversation with a collector,
 * creating it when needed (`POST /conversations` is idempotent: 200 existing, 201 new). Refusals
 * (403 MESSAGING_BLOCKED: a block, or the collector's messaging permission) are explained in a
 * snack bar and resolve `null`.
 */
@Injectable({ providedIn: 'root' })
export class ConversationStarterService {
  private readonly api = inject(MessagingService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly startingState = signal<string | null>(null);
  /** Recipient id of the conversation being opened (to show progress on the button). */
  readonly starting = this.startingState.asReadonly();

  async start(recipientId: string): Promise<ConversationSummary | null> {
    this.startingState.set(recipientId);
    try {
      return await firstValueFrom(
        this.api.startConversation({ startConversationRequest: { recipientId } }, 'body', false, {
          context: silentErrors(),
        }),
      );
    } catch (error) {
      const friendly = friendlyError(toApiError(error));
      this.snackBar.open(`${friendly.title}. ${friendly.message}`, 'OK', { duration: 7000 });
      return null;
    } finally {
      this.startingState.set(null);
    }
  }
}
