import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Where the trading safety notice is shown; each is dismissed on its own. */
export type SafetyNoticeContext = 'conversation' | 'trade';

export const SAFETY_NOTICE_STORAGE_KEY = 'orenjitrade.safety-notice.v1';

/** Dismissal timestamps (ISO) per context, per account id. */
type DismissalMap = Record<string, Partial<Record<SafetyNoticeContext, string>>>;

interface SafetyNoticeState {
  dismissals: DismissalMap;
  /** True once the stored dismissals were read (nothing is shown before, so no notice flashes). */
  hydrated: boolean;
  dismiss: (userId: string, context: SafetyNoticeContext, at?: string) => void;
  reset: () => void;
}

/**
 * Remembers which trading safety notices a collector dismissed (mirror of the web's
 * `SafetyNoticeService`). There is no server-side preferences mechanism for this kind of hint
 * (only typed privacy, notification and offer settings), so the dismissal lives on this device
 * (AsyncStorage), keyed by account id so two collectors sharing a device each see the notice
 * once. Signing in on another device shows it again, which is acceptable for a safety reminder.
 */
export const useSafetyNoticeStore = create<SafetyNoticeState>()(
  persist(
    (set) => ({
      dismissals: {},
      hydrated: false,
      dismiss: (userId, context, at = new Date().toISOString()) =>
        set((state) => ({
          dismissals: {
            ...state.dismissals,
            [userId]: { ...state.dismissals[userId], [context]: at },
          },
        })),
      reset: () => set({ dismissals: {} }),
    }),
    {
      name: SAFETY_NOTICE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ dismissals: state.dismissals }),
      onRehydrateStorage: () => () => {
        useSafetyNoticeStore.setState({ hydrated: true });
      },
    }
  )
);

/** True once `userId` dismissed the notice of `context` on this device. */
export function isSafetyNoticeDismissed(
  dismissals: DismissalMap,
  userId: string | null,
  context: SafetyNoticeContext
): boolean {
  return !!userId && !!dismissals[userId]?.[context];
}

/**
 * Whether to show the notice of `context` to `userId`: `null` while the stored dismissals are
 * not read yet (render nothing), otherwise the answer.
 */
export function useSafetyNoticeVisible(
  userId: string | null,
  context: SafetyNoticeContext
): boolean | null {
  const hydrated = useSafetyNoticeStore((state) => state.hydrated);
  const dismissed = useSafetyNoticeStore((state) =>
    isSafetyNoticeDismissed(state.dismissals, userId, context)
  );
  if (!hydrated) {
    return null;
  }
  return !!userId && !dismissed;
}
