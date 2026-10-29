import { Injectable } from '@angular/core';

/**
 * The text a collector started in each chat, kept while the page is open (spec 10.6: opening
 * another chat in the drawer keeps the draft of the first, and Messages shows the same draft).
 * In memory only: nothing is written to localStorage, sessionStorage or IndexedDB, and the
 * address and e-Transfer email are never drafted (decision 9: they are typed in their own dialog
 * and sent at once).
 */
@Injectable({ providedIn: 'root' })
export class ChatDrafts {
  private readonly drafts = new Map<string, string>();

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

  /** Signing out forgets every draft. */
  clearAll(): void {
    this.drafts.clear();
  }
}
