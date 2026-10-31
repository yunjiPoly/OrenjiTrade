import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';

type LeaveAction = Parameters<Parameters<typeof usePreventRemove>[1]>[0]['data']['action'];

export interface LeaveGuard {
  /** The collector tried to leave and has not answered yet. */
  asking: boolean;
  /** Leaves after all (carries out what was held back). */
  leave: () => void;
  /** Stays on the screen. */
  stay: () => void;
}

/**
 * Holds a screen while `active`: the back button of the header, the back gesture and Android's
 * back key ask first instead of leaving (`asking`), and `leave` then carries out what was held
 * back. Used where leaving would lose something, or where the collector may believe a flow was
 * finished when it was not.
 */
export function useLeaveGuard(active: boolean): LeaveGuard {
  const navigation = useNavigation();
  const [held, setHeld] = useState<LeaveAction | null>(null);
  const [released, setReleased] = useState(false);

  usePreventRemove(active && !released, ({ data }) => setHeld(data.action));

  useEffect(() => {
    if (released && held) {
      navigation.dispatch(held);
    }
  }, [held, navigation, released]);

  return {
    asking: held !== null && !released,
    leave: () => setReleased(true),
    stay: () => setHeld(null),
  };
}
