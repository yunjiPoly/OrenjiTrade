import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import {
  useMyLocation,
  usePrivacySettings,
  useRemoveLocation,
  useSaveLocation,
  useSavePrivacy,
} from '@/src/api/hooks/location';
import type { MyLocationResponse, PrivacySettings } from '@/src/api/types';
import { ConfirmSheet } from '@/src/components/ui/ConfirmSheet';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { FormMessage } from '@/src/components/ui/FormControls';
import { PillButton } from '@/src/components/ui/PillButton';
import { SkeletonList } from '@/src/components/ui/Skeleton';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { LocationFields } from '@/src/features/location/LocationFields';
import {
  draftFromLocation,
  isLocationDirty,
  locationInput,
  missingField,
  type LocationDraft,
} from '@/src/features/location/locationDraft';
import { mapStatus } from '@/src/features/settings/mapStatus';
import { LOCATION_COPY as COPY } from '@/src/features/settings/settingsCopy';
import { SettingsGroup, SettingsSwitch } from '@/src/features/settings/SettingsList';
import { SettingsPage } from '@/src/features/settings/SettingsPage';
import { fontWeight, PINNED_MAX_FONT_SCALE, radius, spacing, useTheme } from '@/src/theme';

/**
 * What "Show me on the map" says under it: where collectors see you, or why they do not (no place
 * yet, the switch off, or a PRIVATE profile, which leaves the map whatever the switch says).
 */
function mapLine(location: MyLocationResponse, privacy: PrivacySettings): string {
  const place = location.location?.label;
  switch (mapStatus(!!place, privacy)) {
    case 'no-place':
      return COPY.noPlace;
    case 'private':
      return COPY.privateHidden;
    case 'hidden':
      return COPY.hidden;
    default:
      return COPY.seenIn(place ?? '');
  }
}

/**
 * Settings › Location (stage R13, mockup v50 screen 49; ADR 0017): "Show me on the map" first
 * (saved at once, as before; it needs a saved place), then the region, the country and the state
 * or province side by side, the optional city and "Show my city on my profile", the box on how
 * OrenjiTrade protects where you live, "Remove my location" (asked in a sheet) and "Save
 * location" at the bottom. No map, no GPS, no geocoding.
 */
export default function LocationSettingsScreen() {
  const location = useMyLocation();
  const privacy = usePrivacySettings();
  if (location.data && privacy.data) {
    return <LocationForm location={location.data} privacy={privacy.data} />;
  }
  const error = location.error ?? privacy.error;
  return (
    <SettingsPage title={COPY.title} testID="screen-settings-location">
      {error ? (
        <ErrorState
          error={error}
          title={COPY.loadError}
          onRetry={() => void Promise.all([location.refetch(), privacy.refetch()])}
          testID="settings-location-error"
        />
      ) : (
        <View accessibilityLabel={COPY.loading} aria-busy>
          <SkeletonList rows={5} rowHeight={56} testID="settings-location-loading" />
        </View>
      )}
    </SettingsPage>
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
  const busy = save.isPending || remove.isPending;

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
      snackbar.show(COPY.saved(answer.location?.label), { icon: 'success' });
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
      snackbar.show(COPY.removed, { icon: 'success' });
    } catch (caught) {
      setConfirmRemove(false);
      setError(messageOf(caught));
    }
  };

  const setDiscoverable = async (discoverable: boolean) => {
    setError(null);
    try {
      await savePrivacy.mutateAsync({ ...privacy, discoverable });
      snackbar.show(discoverable ? COPY.nowOnMap : COPY.nowHidden, { icon: 'success' });
    } catch (caught) {
      setError(messageOf(caught));
    }
  };

  return (
    <SettingsPage
      title={COPY.title}
      testID="screen-settings-location"
      footer={
        <PillButton
          label={COPY.save}
          loading={save.isPending}
          loadingLabel={COPY.saving}
          disabled={!dirty || remove.isPending}
          onPress={() => void saveLocation()}
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          testID="location-save"
        />
      }
    >
      <SettingsGroup>
        <SettingsSwitch
          label={COPY.onMap}
          help={mapLine(location, privacy)}
          helpTestID="location-visibility"
          value={privacy.discoverable}
          onChange={(value) => void setDiscoverable(value)}
          disabled={savePrivacy.isPending || (!saved && !privacy.discoverable)}
          testID="location-discoverable"
        />
      </SettingsGroup>

      <LocationFields
        value={draft}
        onChange={setEdited}
        showErrors={submitted}
        disabled={busy}
        cityHint={COPY.cityHint}
      />
      {error ? <FormMessage testID="location-error">{error}</FormMessage> : null}

      <View
        accessible
        accessibilityLabel={`${COPY.protectTitle}. ${COPY.protectLines.join(' ')}`}
        style={[styles.protect, { borderColor: palette.borderStrong }]}
        testID="location-protect"
      >
        <Text style={[styles.protectTitle, { color: palette.ink }]}>{COPY.protectTitle}</Text>
        {COPY.protectLines.map((line) => (
          <View key={line} style={styles.protectLine}>
            <MaterialCommunityIcons name="check" size={16} color={palette.accent} />
            <Text style={[styles.protectText, { color: palette.settings.rowIcon }]}>{line}</Text>
          </View>
        ))}
      </View>

      {saved ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.remove}
          disabled={busy}
          onPress={() => setConfirmRemove(true)}
          testID="location-remove"
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
        >
          <Text style={[styles.removeText, { color: palette.danger }]}>{COPY.remove}</Text>
        </Pressable>
      ) : null}

      <ConfirmSheet
        visible={confirmRemove}
        title={COPY.removeTitle}
        message={COPY.removeBody}
        confirmLabel={COPY.removeConfirm}
        cancelLabel={COPY.removeKeep}
        busy={remove.isPending}
        onConfirm={() => void removeLocation()}
        onCancel={() => setConfirmRemove(false)}
        testID="location-remove-sheet"
      />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  protect: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: 14,
    gap: spacing[2],
  },
  protectTitle: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  protectLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  protectText: { flex: 1, fontSize: 13, lineHeight: 19 },
  remove: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  removeText: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
