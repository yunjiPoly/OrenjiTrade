import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * True while VoiceOver or TalkBack is on (the Map tab then opens on its list). A browser does not
 * tell a page whether a screen reader runs (react-native-web always answers yes), so the web
 * build never assumes one: both views are a tab away there.
 */
export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return undefined;
    }
    let cancelled = false;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (!cancelled) setEnabled(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return enabled;
}
