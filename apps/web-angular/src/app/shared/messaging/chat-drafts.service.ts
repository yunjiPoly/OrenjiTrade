import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/**
 * The text a collector started in each chat, kept while the page is open (spec 10.6: opening
 * another chat in the drawer keeps the draft of the first, and Messages shows the same draft).
 * In memory only: nothing is written to localStorage, sessionStorage or IndexedDB, and the
 * address and e-Transfer email are never drafted (decision 9: they are typed in their own dialog
 * and sent at once). The drafts belong to the signed-in account: signing out (here or in another
 * tab) or another account signing in forgets every one (WC review F1, P1).
 */
@Injectable({ providedIn: 'root' })
export class ChatDrafts {
  private readonly auth = inject(AuthService);
  private readonly drafts = new Map<string, string>();
  private uid: string | null = this.auth.user()?.uid ?? null;

  constructor() {
    this.auth.changes$.subscribe((change) => {
      const uid = change.user?.uid ?? null;
      if (uid !== this.uid) {
        this.uid = uid;
        this.clearAll();
      }
    });
  }

  get(conversationId: string | null | undefined): string {
    return conversationId ? (this.drafts.get(conversationId) ?? '') : '';
  }

  set(conversationId: string | null | undefined, text: string): void {
    if (!conversationId) {
      return;
    }
    if (text) {
      this.drafts.set(conversationId, text);
    } else {
      this.drafts.delete(conversationId);
    }
  }

  clear(conversationId: string | null | undefined): void {
    this.set(conversationId, '');
  }

  /** Signing out or another account forgets every draft. */
  clearAll(): void {
    this.drafts.clear();
  }
}
