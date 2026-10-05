import { create } from 'zustand';

/**
 * Holds the auth gate while a multi-step flow runs: sign-up signs the user in with Firebase
 * before it records the legal consents, and the gate must not route the half-registered account
 * to the consent screen in the middle of it.
 */
export interface FlowLockStore {
  lockedBy: string | null;
  lock: (flow: string) => void;
  unlock: () => void;
}

export const useFlowLock = create<FlowLockStore>()((set) => ({
  lockedBy: null,
  lock: (flow) => set({ lockedBy: flow }),
  unlock: () => set({ lockedBy: null }),
}));

/** Runs `operation` with the gate held, releasing it whatever happens. */
export async function withFlowLock<T>(flow: string, operation: () => Promise<T>): Promise<T> {
  useFlowLock.getState().lock(flow);
  try {
    return await operation();
  } finally {
    useFlowLock.getState().unlock();
  }
}
