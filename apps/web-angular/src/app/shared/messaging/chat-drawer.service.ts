import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { ConversationSummary } from '@orenji/api-client';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ShellLayout } from '../../core/layout/shell-layout.service';
import { ChatSubjectRequest, ConversationStarterService } from './conversation-starter.service';

/** Who to message from a "Message" button, and what about. */
export interface ChatRequest extends ChatSubjectRequest {
  recipientId: string;
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
  private readonly starter = inject(ConversationStarterService);
  private readonly router = inject(Router);
  private readonly layout = inject(ShellLayout);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  private readonly stateSignal = signal<DrawerState | null>(null);
  readonly state = this.stateSignal.asReadonly();
  /** The recipient being opened (the button shows its progress). */
  readonly starting = this.starter.starting;

  constructor() {
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
    const { recipientId, ...subject } = request;
    const conversation = await this.starter.start(recipientId, subject);
    if (!conversation) {
      return;
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
