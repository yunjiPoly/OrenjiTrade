import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { useFonts } from 'expo-font';

import RootLayout from '@/app/_layout';

/**
 * What the scan knows of the phone's connection (`scanRunner.ts`: the timer skips its try while
 * the phone says it is offline; `useScanEffects.ts`: the waiting tiles are tried again as soon as
 * it is online). It reads TanStack Query's `onlineManager`, which React Native does not feed by
 * itself: the root layout wires it to NetInfo (`connectQueryManagers`). This pins that wiring.
 */

jest.mock('expo-font', () => ({ useFonts: jest.fn(() => [false, null]) }));

type NetInfoListener = (state: NetInfoState) => void;

function netInfoState(isConnected: boolean): NetInfoState {
  return {
    type: isConnected ? 'wifi' : 'none',
    isConnected,
    isInternetReachable: isConnected,
    details: null,
  } as unknown as NetInfoState;
}

afterEach(() => {
  onlineManager.setOnline(true);
  (useFonts as jest.Mock).mockReturnValue([false, null]);
});

describe("the scan's view of the connection", () => {
  it('follows NetInfo once the root layout is up', () => {
    const listeners: NetInfoListener[] = [];
    const unsubscribe = jest.fn();
    const addEventListener = jest
      .spyOn(NetInfo, 'addEventListener')
      .mockImplementation((listener) => {
        listeners.push(listener as NetInfoListener);
        return unsubscribe;
      });
    try {
      // The fonts still load: the layout draws nothing yet, its wiring runs all the same.
      const view = render(<RootLayout />);
      expect(listeners).toHaveLength(1);

      act(() => listeners[0]?.(netInfoState(false)));
      expect(onlineManager.isOnline()).toBe(false);
      act(() => listeners[0]?.(netInfoState(true)));
      expect(onlineManager.isOnline()).toBe(true);

      view.unmount();
      expect(unsubscribe).toHaveBeenCalled();
    } finally {
      addEventListener.mockRestore();
    }
  });
});
