import { create } from 'zustand';

/**
 * The session ended on its own (the Auth account no longer exists, its refresh token was revoked,
 * or the API refuses every token it gets): the app signs out, routes to sign-in and says why there
 * instead of leaving every screen on "Your session has ended". Not persisted.
 */
export interface SessionNoticeStore {
  ended: boolean;
  reportEnded: () => void;
  clear: () => void;
}

export const useSessionNotice = create<SessionNoticeStore>()((set) => ({
  ended: false,
  reportEnded: () => set({ ended: true }),
  clear: () => set({ ended: false }),
}));

export const SESSION_ENDED_MESSAGE = 'Your session has ended. Sign in again to continue.';
