import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import {
  useMyLocation,
  usePrivacySettings,
  useRemoveLocation,
  useSavePrivacy,
  useSaveTradingArea,
} from '@/src/api/hooks/location';
import type { MyLocationResponse, PrivacySettings } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog';
import { FormMessage, SwitchRow } from '@/src/components/ui/FormControls';
import { SectionCard } from '@/src/components/ui/Layout';
import { QueryState } from '@/src/components/ui/QueryState';
import { Screen } from '@/src/components/ui/Screen';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { TradingAreaPicker } from '@/src/features/location/TradingAreaPicker';
import {
  areaInput,
  draftFromLocation,
  isAreaDirty,
  type AreaDraft,
} from '@/src/features/location/tradingArea';
import { placeLabel } from '@/src/lib/location';
import { spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Settings → Location and discoverability (web: `/settings/trading-area` + the "Show me on the
 * map" privacy switch): the trading area, its public label, removal, and the map opt-in.
 */
export default function LocationSettingsScreen() {
  const location = useMyLocation();
  const privacy = usePrivacySettings();
  const query = {
    data:
      location.data && privacy.data
        ? { location: location.data, privacy: privacy.data }
        : undefined,
    error: location.error ?? privacy.error,
    isPending: location.isPending || privacy.isPending,
    isFetching: location.isFetching || privacy.isFetching,
    refetch: () => Promise.all([location.refetch(), privacy.refetch()]),
  };
  return (
    <Screen scroll safeBottom testID="screen-settings-location">
      <QueryState
        query={query}
        errorTitle="We could not load your trading area"
        loading={<SkeletonList rows={4} rowHeight={56} />}
        testID="settings-location"
      >
        {(data) => <LocationForm location={data.location} privacy={data.privacy} />}
      </QueryState>
    </Screen>
  );
}

function LocationForm({
  location,
  privacy,
}: {
  location: MyLocationResponse;
  privacy: PrivacySettings;
}) {
  const { palette } = useTheme();
  const snackbar = useSnackbar();
  const save = useSaveTradingArea();
  const remove = useRemoveLocation();
  const savePrivacy = useSavePrivacy();
  const [edited, setEdited] = useState<AreaDraft | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = edited ?? draftFromLocation(location);
  const dirty = isAreaDirty(draft, location);
  const hasArea = !!location.tradingArea;

  const saveArea = async () => {
    const input = areaInput(draft, location);
    if (!input) {
      return;
    }
    setError(null);
    try {
      const saved = await save.mutateAsync(input);
      setEdited(null);
      snackbar.show(
        `Trading area saved${saved.tradingArea?.label ? ` · ${saved.tradingArea.label}` : ''}.`
      );
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const removeArea = async () => {
    setError(null);
    try {
      await remove.mutateAsync();
      setEdited(null);
      setConfirmRemove(false);
      snackbar.show('Your location was removed.');
    } catch (caught) {
      setConfirmRemove(false);
      setError(messageOf(caught));
    }
  };

  const setDiscoverable = async (discoverable: boolean) => {
    setError(null);
    try {
      await savePrivacy.mutateAsync({ ...privacy, discoverable });
      snackbar.show(discoverable ? 'You now appear on the map.' : 'You are hidden from the map.');
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  return (
    <View style={styles.root}>
      <SectionCard
        title="Trading area"
        description="Where you like to meet or ship from. Only you see the centre you pick; others see an approximate area."
      >
        <TradingAreaPicker
          value={draft}
          onChange={setEdited}
          location={location}
          disabled={save.isPending || remove.isPending}
        />
        {error ? <FormMessage testID="location-error">{error}</FormMessage> : null}
        <Button
          label="Save trading area"
          loading={save.isPending}
          disabled={!dirty || remove.isPending}
          onPress={() => void saveArea()}
          testID="location-save"
        />
        {hasArea ? (
          <Button
            label="Remove location"
            variant="ghost"
            icon="map-marker-off-outline"
            disabled={save.isPending || remove.isPending}
            onPress={() => setConfirmRemove(true)}
            testID="location-remove"
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Discoverability" description="Off by default. Change it anytime.">
        <SwitchRow
          label="Show me on the map"
          help="Collectors nearby see an approximate point for you and can open your public binders. When off, you are hidden from the map and from nearby searches."
          value={privacy.discoverable}
          onChange={(value) => void setDiscoverable(value)}
          disabled={savePrivacy.isPending}
          testID="location-discoverable"
        />
        <View style={[styles.callout, { backgroundColor: palette.surfaceVariant }]}>
          <MaterialCommunityIcons
            name={privacy.discoverable ? 'eye-outline' : 'eye-off-outline'}
            size={20}
            color={palette.textMuted}
          />
          <Text
            testID="location-visibility"
            style={[textStyle('sm'), styles.grow, { color: palette.ink }]}
          >
            {!hasArea
              ? 'You have no trading area yet, so you never appear on the map.'
              : !privacy.discoverable
                ? `You are hidden from the map. Turn on “Show me on the map” to appear near ${placeLabel(location.tradingArea?.label) ?? 'your area'}.`
                : `Collectors see you near ${placeLabel(location.tradingArea?.label) ?? 'your area'}.`}
          </Text>
        </View>
      </SectionCard>

      <SectionCard title="How OrenjiTrade protects where you live">
        {[
          'You choose an approximate trading area, never an address.',
          'We snap it to a ~1 km grid and add a fixed offset unique to you.',
          'Distances are shown as ranges (“1–5 km”), never in metres.',
          'Your chosen centre is only visible to you.',
        ].map((line) => (
          <Text key={line} style={[textStyle('sm'), { color: palette.textMuted }]}>
            • {line}
          </Text>
        ))}
      </SectionCard>

      <ConfirmDialog
        visible={confirmRemove}
        title="Remove your location?"
        message="You will disappear from the map and nearby searches until you set a new trading area."
        confirmLabel="Remove location"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void removeArea()}
        onCancel={() => setConfirmRemove(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  callout: { flexDirection: 'row', gap: spacing[2], padding: spacing[3], borderRadius: 10 },
  grow: { flex: 1 },
});
