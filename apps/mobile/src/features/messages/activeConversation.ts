import { create } from 'zustand';

/**
 * The conversation on screen right now (the thread screen is focused and the app is in the
 * foreground), or null. A message pushed for it does not raise the inbox's unread count: the
 * thread marks it read instead (web: `ConversationsStore.open` + `setVisible`). Not persisted.
 */
export interface ActiveConversationStore {
  id: string | null;
  set: (id: string | null) => void;
}

export const useActiveConversation = create<ActiveConversationStore>()((set) => ({
  id: null,
  set: (id) => set({ id }),
}));

export function activeConversationId(): string | null {
  return useActiveConversation.getState().id;
}
