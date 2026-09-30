import { StyleSheet, View } from 'react-native';

import { MapPlaceholder } from './MapPlaceholder';

/** `react-native-maps` has no web implementation; show a placeholder instead (ADR 0010 fallback). */
export function CollectorMap() {
  return (
    <View style={styles.container} testID="collector-map-container">
      <MapPlaceholder reason="web" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
