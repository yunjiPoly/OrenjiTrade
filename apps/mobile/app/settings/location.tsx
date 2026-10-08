import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import {
  useMyLocation,
  usePrivacySettings,
  useRemoveLocation,
  useSaveLocation,
  useSavePrivacy,
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
import { LocationFields } from '@/src/features/location/LocationFields';
import {
  draftFromLocation,
  isLocationDirty,
  locationInput,
  missingField,
  type LocationDraft,
} from '@/src/features/location/locationDraft';
import { spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Settings → Location and discoverability (ADR 0017, the web's `/settings/location` plus the
 * "Show me on the map" privacy switch): the self-declared country, state or province and optional
 * city, what others see, removal, and the map opt-in (which needs a location).
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
        errorTitle="We could not load your location"
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
  const save = useSaveLocation();
  const remove = useRemoveLocation();
  const savePrivacy = useSavePrivacy();
  const [edited, setEdited] = useState<LocationDraft | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = edited ?? draftFromLocation(location);
  const dirty = isLocationDirty(draft, location);
  const saved = location.location ?? null;

  const saveLocation = async () => {
    setSubmitted(true);
    if (missingField(draft)) {
      return;
    }
    setError(null);
    try {
      const answer = await save.mutateAsync(locationInput(draft));
      setEdited(null);
      setSubmitted(false);
      snackbar.show(
        `Location saved${answer.location?.label ? ` · ${answer.location.label}` : ''}.`
      );
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  const removeLocation = async () => {
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
        title="Location"
        description="Your country and state or province decide your region and where your binders appear. Others never see more than your state or province (and your city on your profile, if you choose)."
      >
        {saved ? (
          <Text testID="location-label" style={[textStyle('md'), { color: palette.ink }]}>
            {saved.label} · {saved.regionName}
          </Text>
        ) : (
          <Text testID="location-none" style={[textStyle('sm'), { color: palette.textMuted }]}>
            You have not said where you are yet, so you do not appear on the map.
          </Text>
        )}
        <LocationFields
          value={draft}
          onChange={setEdited}
          showErrors={submitted}
          disabled={save.isPending || remove.isPending}
        />
        {error ? <FormMessage testID="location-error">{error}</FormMessage> : null}
        <Button
          label="Save location"
          loading={save.isPending}
          disabled={!dirty || remove.isPending}
          onPress={() => void saveLocation()}
          testID="location-save"
        />
        {saved ? (
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
          help="Collectors of your region see your state or province and can open your public binders. When off, you are hidden from the map and from searches. Needs a location."
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
            {!saved
              ? 'You have not chosen a location yet, so you never appear on the map.'
              : !privacy.discoverable
                ? `You are hidden from the map. Turn on “Show me on the map” to appear in ${saved.label}.`
                : `Collectors see you in ${saved.label}.`}
          </Text>
        </View>
      </SectionCard>

      <SectionCard title="How OrenjiTrade protects where you live">
        {[
          'You choose your country and state or province; never an address, and the app never uses GPS.',
          'The map counts binders per state or province: no pin, no point, no distance.',
          'Your city is optional and shown only on your profile, if you want.',
        ].map((line) => (
          <Text key={line} style={[textStyle('sm'), { color: palette.textMuted }]}>
            • {line}
          </Text>
        ))}
      </SectionCard>

      <ConfirmDialog
        visible={confirmRemove}
        title="Remove your location?"
        message="You will disappear from the map and from searches in your region until you choose a location again."
        confirmLabel="Remove location"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() => void removeLocation()}
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
