import { useEffect, useState } from 'react';

/** How long "Resend email" waits after an email was sent (39 Verify your email, 38's sent state). */
export const RESEND_COOLDOWN_S = 30;

/**
 * The seconds left before an email may be sent again ("Resend in {n} s"), counting down once a
 * second, and the function that starts it.
 */
export function useResendCooldown(): [number, (seconds?: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return [left, (seconds = RESEND_COOLDOWN_S) => setLeft(seconds)];
}
