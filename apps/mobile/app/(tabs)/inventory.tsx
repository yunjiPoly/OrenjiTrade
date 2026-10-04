import { EmptyState } from '@/src/components/ui/EmptyState';
import { Screen } from '@/src/components/ui/Screen';

/** Inventory tab: the collector's own binders and cards (mobile stage for Phase 3). */
export default function InventoryScreen() {
  return (
    <Screen testID="screen-inventory">
      <EmptyState
        icon="cards-outline"
        title="Your binders live here soon"
        description="Managing binders and cards arrives in a later version of the app. Until then, use the OrenjiTrade website to add cards; they will show up here."
      />
    </Screen>
  );
}
