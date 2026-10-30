import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { ChatDrafts } from './chat-drafts.service';
import type { ChatSubjectRequest } from './conversation-starter.service';

/** Who to message from a "Message" button, and what about. */
export interface ChatRequest extends ChatSubjectRequest {
  recipientId: string;
  /**
   * Text waiting in the message box, never sent by itself ("I have it": "Hi! I have {card}.",
   * spec 5.2); a draft already typed in that chat is kept instead.
   */
  draft?: string;
}

interface DrawerState {
  conversation: ConversationSummary;
  /** The control that opened it: the focus goes back there when the drawer closes. */
  opener: HTMLElement | null;
}

/**
 * The chat drawer (spec 10.6, board W21): "Message" anywhere (a card's holders, a binder, Home, a
 * profile) opens the chat in a 440 non-modal drawer on the right, one at a time (opening another
 * replaces it; each chat keeps its draft), so the collector keeps browsing. Below 960 it goes to
 * `/messages/:id` instead. Leaving for Messages closes it. The drawer itself is a lazy chunk
 * shared with Messages (the shell's `@defer`); this service only holds which chat is open.
 */
@Injectable({ providedIn: 'root' })
export class ChatDrawer {
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly layout = inject(ShellLayout);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly drafts = inject(ChatDrafts);

  private readonly stateSignal = signal<DrawerState | null>(null);
  readonly state = this.stateSignal.asReadonly();
  private readonly startingState = signal<string | null>(null);
  /** The recipient being opened (the button shows its progress). */
  readonly starting = this.startingState.asReadonly();

  /** The account the open chat belongs to. */
  private uid: string | null = this.auth.user()?.uid ?? null;

  constructor() {
    // The drawer follows the account: signing out (here or in another tab) or switching to
    // another account closes it at once, without giving the focus back (WC review F1, P1).
    this.auth.changes$.subscribe((change) => this.onAccount(change.user?.uid ?? null));
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        // Messages shows the chat itself: one place at a time.
        if (this.stateSignal() && event.urlAfterRedirects.startsWith('/messages')) {
          this.stateSignal.set(null);
        }
      });
  }

  /** Opens the chat with a collector (created when needed), in the drawer or full page. */
  async message(request: ChatRequest, opener?: EventTarget | null): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      await this.router.navigate(['/auth/sign-in'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    const { recipientId, draft, ...subject } = request;
    const uid = this.auth.user()?.uid ?? null;
    this.startingState.set(recipientId);
    let conversation: ConversationSummary | null;
    try {
      // Loaded on the first "Message": the messaging client stays out of the initial bundle.
      const { ConversationStarterService } = await import('./conversation-starter.service');
      conversation = await this.injector
        .get(ConversationStarterService)
        .start(recipientId, subject);
    } finally {
      this.startingState.set(null);
    }
    // Signed out (or another account) while the chat was being started: nothing opens.
    if (!conversation || uid !== (this.auth.user()?.uid ?? null)) {
      return;
    }
    if (draft && !this.drafts.get(conversation.id)) {
      this.drafts.set(conversation.id, draft);
    }
    if (this.layout.narrow()) {
      await this.router.navigate(['/messages', conversation.id]);
      return;
    }
    const element = opener instanceof HTMLElement ? opener : null;
    this.stateSignal.set({
      conversation,
      opener: element ?? this.stateSignal()?.opener ?? null,
    });
  }

  /** The drawer read the conversation again (its pinned card): kept for the next open. */
  update(conversation: ConversationSummary): void {
    const state = this.stateSignal();
    if (state && state.conversation.id === conversation.id) {
      this.stateSignal.set({ ...state, conversation });
    }
  }

  private onAccount(uid: string | null): void {
    if (uid === this.uid) {
      return;
    }
    this.uid = uid;
    this.stateSignal.set(null);
    this.startingState.set(null);
  }

  /** Closes the drawer; the focus goes back to the control that opened it (spec 10.6). */
  close(returnFocus = true): void {
    const opener = this.stateSignal()?.opener ?? null;
    this.stateSignal.set(null);
    if (returnFocus) {
      setTimeout(() => {
        if (opener?.isConnected) {
          opener.focus();
        } else {
          this.document.getElementById('main-content')?.focus();
        }
      });
    }
  }
}
