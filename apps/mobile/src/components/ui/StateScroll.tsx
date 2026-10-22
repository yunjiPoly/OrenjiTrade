import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

export interface StateScrollProps {
  children: ReactNode;
  testID?: string;
}

/**
 * Holds a screen-filling state (closed, empty, not found, error) so it scrolls once the text size
 * makes it taller than its space: centred while it fits (an `EmptyState` grows to fill it), never
 * drawn over the title and the tabs above it or under the tab bar when it does not (stage R11
 * review fix 2: "The Community is closed right now" covered the status bar at the largest size).
 */
export function StateScroll({ children, testID }: StateScrollProps) {
  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
});
