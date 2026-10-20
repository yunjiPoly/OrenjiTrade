import { create } from 'zustand';

import type { DraftAttachment } from './messageDraft';

/**
 * What a chat's message box starts with when a screen opens the chat to say something (stage R6,
 * "I have it": owner spec 2026-10-14, section 10): the text "I have {card} for your wishlist.
 * Interested?" and, when you hold the card, your copy to share with it. Nothing is sent: the chat
 * puts it in the message box, where the collector checks it and taps send (or changes it). Kept in
 * memory for one chat until that chat has read it; never persisted.
 */
export interface PendingDraft {
  text: string;
  attachment: DraftAttachment | null;
}

interface PendingDraftStore {
  drafts: Record<string, PendingDraft>;
  set: (conversationId: string, draft: PendingDraft) => void;
  clear: (conversationId: string) => void;
}

export const usePendingDrafts = create<PendingDraftStore>()((set) => ({
  drafts: {},
  set: (conversationId, draft) =>
    set((state) => ({ drafts: { ...state.drafts, [conversationId]: draft } })),
  clear: (conversationId) =>
    set((state) => {
      if (!(conversationId in state.drafts)) {
        return state;
      }
      const drafts = { ...state.drafts };
      delete drafts[conversationId];
      return { drafts };
    }),
}));

/** Leaves a draft for a chat about to open. */
export function setPendingDraft(conversationId: string, draft: PendingDraft): void {
  usePendingDrafts.getState().set(conversationId, draft);
}

/** The draft left for a chat, without taking it (the chat clears it once it has it). */
export function peekPendingDraft(conversationId: string): PendingDraft | null {
  return usePendingDrafts.getState().drafts[conversationId] ?? null;
}

export function clearPendingDraft(conversationId: string): void {
  usePendingDrafts.getState().clear(conversationId);
}
