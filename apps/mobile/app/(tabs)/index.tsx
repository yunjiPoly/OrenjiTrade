import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useCard } from '@/src/api/hooks/catalog';
import { usePrivacySettings } from '@/src/api/hooks/location';
import { CollectorMap } from '@/src/components/map/CollectorMap';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { CollectorList } from '@/src/features/map/CollectorList';
import { CollectorPreviewSheet } from '@/src/features/map/CollectorPreviewSheet';
import { activeFilterCount, holdersTarget, statusLabel } from '@/src/features/map/discovery';
import {
  AreaPrompt,
  HiddenFromMapNotice,
  MapEmptyNotice,
  MapPrivacyNote,
  RadiusLimitNotice,
  RefreshErrorNotice,
} from '@/src/features/map/MapNotices';
import { MapToolbar, type MapView } from '@/src/features/map/MapToolbar';
import { useCollectorDiscovery } from '@/src/features/map/useCollectorDiscovery';
import { APPROXIMATE_LOCATION_NOTE } from '@/src/lib/approximateArea';
import { spacing } from '@/src/theme';

const MAP_LABEL = `Map of collectors near you. ${APPROXIMATE_LOCATION_NOTE}.`;

/**
 * Map tab (Phase 4, the web's `/map`): collectors near the viewer as zones about 3 km wide around
 * their public points (never pins; zoom capped at 14, ADR 0004), from `GET /collectors/nearby`
 * with game / intent / distance filters, "who has this card near me" (`?card=` from a card
 * detail), a list alternative, and the preview bottom sheet. Loading skeleton, empty states (no
 * collectors in range, you are hidden), error with retry, and the last answer kept offline.
 */
export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ card?: string; printing?: string }>();
  const target = useMemo(
    () => holdersTarget({ card: params.card, printing: params.printing }),
    [params.card, params.printing]
  );
  const targetKey = target ? `${target.kind}:${target.id}` : null;
  // "Show every collector" hides the card filter at once (the route follows); a new card from a
  // card detail applies again.
  const [clearedKey, setClearedKey] = useState<string | null>(null);
  const [seenKey, setSeenKey] = useState(targetKey);
  if (seenKey !== targetKey) {
    setSeenKey(targetKey);
    setClearedKey(null);
  }
  const holders = target && targetKey !== clearedKey ? target : null;
  const card = useCard(holders?.kind === 'card' ? holders.id : null);
  const holdersTitle = holders
    ? holders.kind === 'card'
      ? (card.data?.name ?? null)
      : 'this printing'
    : undefined;

  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<MapView>('map');
  const [hiddenDismissed, setHiddenDismissed] = useState(false);
  const discovery = useCollectorDiscovery(holders, selected);
  const privacy = usePrivacySettings();
  const selfId = useAccount().me?.id ?? null;
  const { result, start } = discovery;

  const marker = useMemo(
    () => discovery.collectors.find((collector) => collector.handle === selected) ?? null,
    [discovery.collectors, selected]
  );
  const clearHolders = useCallback(() => {
    if (targetKey) {
      setClearedKey(targetKey);
    }
    router.setParams({ card: '', printing: '' });
  }, [router, targetKey]);
  const showOnMap = useCallback(
    (handle: string) => {
      setSelected(null);
      setView('map');
      discovery.zoomToCollector(handle);
    },
    [discovery]
  );
  const openLocationSettings = useCallback(() => router.push('/settings/location'), [router]);

  const status = statusLabel(result, !!holders, !!discovery.error);
  const filtersActive = activeFilterCount(discovery.filters) > 0;
  const toolbar = (
    <MapToolbar
      status={status}
      loading={discovery.loading}
      filters={discovery.filters}
      radiusKm={discovery.radiusKm}
      radiusCap={discovery.radiusCap}
      onFilters={discovery.updateFilters}
      onClearFilters={discovery.clearFilters}
      view={view}
      onView={setView}
      holdersTitle={holdersTitle}
      onClearHolders={clearHolders}
    />
  );
  const notHidden = privacy.data?.discoverable === false && !hiddenDismissed;
  const notices = (
    <>
      {discovery.origin === 'city' ? (
        <AreaPrompt
          city={discovery.city}
          onCity={discovery.chooseCity}
          onSetArea={openLocationSettings}
        />
      ) : null}
      {discovery.limitLowered ? <RadiusLimitNotice radiusKm={discovery.radiusKm} /> : null}
      {discovery.refreshError ? <RefreshErrorNotice onRetry={discovery.retry} /> : null}
      {notHidden ? (
        <HiddenFromMapNotice
          onOpenSettings={openLocationSettings}
          onDismiss={() => setHiddenDismissed(true)}
        />
      ) : null}
    </>
  );

  let body;
  if (view === 'list') {
    body = (
      <View style={styles.fill}>
        <View style={styles.listTop}>{toolbar}</View>
        <View style={styles.listNotices}>{notices}</View>
        <CollectorList
          result={result}
          error={discovery.error}
          onRetry={discovery.retry}
          selfId={selfId}
          holders={!!holders}
          selectedHandle={selected}
          onSelect={setSelected}
          emptyTitle={status}
          onClearFilters={filtersActive ? discovery.clearFilters : undefined}
          game={discovery.filters.game ?? null}
        />
      </View>
    );
  } else if (!start && discovery.error) {
    body = (
      <View style={styles.fill}>
        <View style={styles.listTop}>{toolbar}</View>
        <ErrorState
          testID="map-error"
          error={discovery.error}
          title="Collectors could not load"
          onRetry={discovery.retry}
        />
      </View>
    );
  } else {
    body = (
      <View style={styles.fill}>
        {start ? (
          <CollectorMap
            zones={discovery.layer.zones}
            clusters={discovery.layer.clusters}
            initialCamera={start}
            camera={discovery.camera}
            onViewportChange={discovery.viewportChanged}
            onZonePress={setSelected}
            onClusterPress={discovery.expandCluster}
            accessibilityLabel={MAP_LABEL}
          />
        ) : (
          <View style={styles.fill} testID="map-loading-state" aria-busy>
            <Skeleton radius={0} style={styles.fill} />
          </View>
        )}
        <View style={styles.top} pointerEvents="box-none">
          {toolbar}
        </View>
        <View style={styles.bottom} pointerEvents="box-none">
          {notices}
          {result && result.total === 0 ? (
            <MapEmptyNotice
              title={status}
              onClearFilters={filtersActive ? discovery.clearFilters : undefined}
            />
          ) : null}
          <MapPrivacyNote />
        </View>
      </View>
    );
  }

  return (
    <Screen edgeToEdge testID="screen-map">
      {body}
      <CollectorPreviewSheet
        handle={selected}
        marker={marker}
        centre={discovery.previewCentre}
        selfId={selfId}
        holdersCard={holders?.kind === 'card' ? (card.data ?? null) : null}
        onClose={() => setSelected(null)}
        onShowOnMap={showOnMap}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, height: undefined },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: spacing[3] },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing[3],
    // The map's zoom buttons and credit sit bottom right.
    paddingRight: spacing[16],
    gap: spacing[2],
  },
  listTop: { padding: spacing[3], paddingBottom: 0 },
  listNotices: { paddingHorizontal: spacing[3], paddingTop: spacing[2], gap: spacing[2] },
});
