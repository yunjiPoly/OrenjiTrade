import { CollectorMap } from '@/src/components/map/CollectorMap';
import { Screen } from '@/src/components/ui/Screen';

/** Map tab: approximate collector positions (ADR 0004). Markers land in Phase 4. */
export default function MapScreen() {
  return (
    <Screen edgeToEdge testID="screen-map">
      <CollectorMap />
    </Screen>
  );
}
