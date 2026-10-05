import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { useSaveTradingArea } from '@/src/api/hooks/location';
import type { MyLocationResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { Chip } from '@/src/components/ui/Chip';
import { FormMessage } from '@/src/components/ui/FormControls';
import { Stepper } from '@/src/components/ui/Stepper';
import {
  CITY_PRESETS,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  nextRadius,
  placeLabel,
  presetAt,
  type CityPreset,
  type LatLng,
} from '@/src/lib/location';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { readApproximatePosition } from './deviceLocation';
import {
  describeCentre,
  draftFromLocation,
  draftPin,
  draftViewport,
  pointDraft,
  presetDraft,
  type AreaDraft,
} from './tradingArea';
import { TradingAreaMap } from './TradingAreaMap';
import type { MapFocus } from './TradingAreaMap.types';

export interface TradingAreaPickerProps {
  value: AreaDraft;
  onChange: (value: AreaDraft) => void;
  /** `GET /me/location` (label of the saved area, whether one exists). */
  location: MyLocationResponse | undefined;
  disabled?: boolean;
}

type DeviceMessage = { tone: 'error' | 'success'; text: string } | null;

function savedKey(location: MyLocationResponse | undefined): string {
  const area = location?.tradingArea;
  return area ? `${area.source}:${area.lat}:${area.lng}:${area.radiusKm}` : 'none';
}

/**
 * Trading-area picker, the same mechanism as the web's (`trading-area-picker.component.ts`): tap
 * the map or drag the pin to move the centre, "Use map centre", a 1–50 km radius, city quick
 * picks, and the device location. Hand-picked centres are rounded to 3 decimals and saved with
 * source MANUAL (`PUT /me/location/trading-area`); the server snaps them further.
 *
 * "Use my current location" reads the device ONCE at reduced accuracy and sends it straight to the
 * API (source DEVICE), which snaps it; the device position is never drawn, shown, stored or logged
 * (ADR 0004). Collectors only ever see the server's approximate area and label.
 */
export function TradingAreaPicker({ value, onChange, location, disabled }: TradingAreaPickerProps) {
  const { palette } = useTheme();
  const save = useSaveTradingArea();
  const [locating, setLocating] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState<DeviceMessage>(null);
  const [focus, setFocus] = useState<MapFocus>(() => ({
    ...draftViewport(value, location),
    radiusKm: value.radiusKm,
    seq: 0,
  }));
  const [viewportCentre, setViewportCentre] = useState<LatLng>(() =>
    draftViewport(value, location)
  );
  const saved = location?.tradingArea;
  const selectedPreset = value.kind === 'point' ? presetAt(value.lat, value.lng) : null;

  const lookAt = (target: LatLng, radiusKm: number) => {
    setViewportCentre(target);
    setFocus((current) => ({ ...target, radiusKm, seq: current.seq + 1 }));
  };

  // When the saved area changes (device location saved, area removed), the map shows it
  // (React's "adjust state when a prop changes" pattern, no effect needed).
  const savedAreaKey = savedKey(location);
  const [seenSavedKey, setSeenSavedKey] = useState(savedAreaKey);
  if (seenSavedKey !== savedAreaKey) {
    setSeenSavedKey(savedAreaKey);
    const draft = draftFromLocation(location);
    lookAt(draftViewport(draft, location), draft.radiusKm);
  }

  const pick = (point: LatLng) => {
    if (!disabled) {
      setDeviceMessage(null);
      onChange(pointDraft(point, value.radiusKm));
    }
  };

  const choosePreset = (preset: CityPreset) => {
    const draft = presetDraft(preset);
    setDeviceMessage(null);
    onChange(draft);
    lookAt({ lat: preset.lat, lng: preset.lng }, draft.radiusKm);
  };

  const locateDevice = async () => {
    setLocating(true);
    setDeviceMessage(null);
    try {
      const position = await readApproximatePosition();
      if (position.status === 'denied') {
        setDeviceMessage({
          tone: 'error',
          text: 'Location permission was denied. Tap the map or pick a city instead, or allow location in your device settings.',
        });
        return;
      }
      if (position.status === 'unavailable') {
        setDeviceMessage({
          tone: 'error',
          text: 'Your location is not available right now. Tap the map or pick a city instead.',
        });
        return;
      }
      const result = await save.mutateAsync({
        lat: position.lat,
        lng: position.lng,
        radiusKm: value.radiusKm,
        source: 'DEVICE',
      });
      onChange({ kind: 'saved', radiusKm: value.radiusKm });
      const near = placeLabel(result.tradingArea?.label);
      setDeviceMessage({
        tone: 'success',
        text: near
          ? `Trading area set near ${near}.`
          : 'Trading area set from your approximate location.',
      });
    } catch (caught) {
      setDeviceMessage({ tone: 'error', text: messageOf(caught) });
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={styles.root} testID="trading-area-picker">
      <View style={[styles.status, { backgroundColor: palette.surfaceVariant }]}>
        <MaterialCommunityIcons name="map-marker-radius-outline" size={20} color={palette.accent} />
        <Text
          testID="area-public-label"
          style={[textStyle('sm'), styles.statusText, { color: palette.ink }]}
        >
          {saved
            ? `${saved.label ?? 'Approximate area'} · ${saved.radiusKm} km radius`
            : 'No trading area saved yet.'}
        </Text>
      </View>

      <TradingAreaMap
        centre={draftPin(value)}
        radiusKm={value.radiusKm}
        focus={focus}
        onPick={pick}
        onViewportChange={setViewportCentre}
        disabled={disabled}
      />
      <View style={styles.hint}>
        <MaterialCommunityIcons name="gesture-tap" size={18} color={palette.textMuted} />
        <Text style={[textStyle('sm'), styles.grow, { color: palette.textMuted }]}>
          Tap the map or drag the pin to move your area.
        </Text>
      </View>
      <Text
        testID="area-centre-summary"
        accessibilityLiveRegion="polite"
        style={[textStyle('sm'), styles.summary, { color: palette.ink }]}
      >
        {describeCentre(value, location)}
      </Text>

      <Stepper
        label="Trading radius"
        value={value.radiusKm}
        format={(km) => `${km} km`}
        min={MIN_RADIUS_KM}
        max={MAX_RADIUS_KM}
        next={nextRadius}
        onChange={(radiusKm) => onChange({ ...value, radiusKm })}
        disabled={disabled}
        testID="area-radius"
      />

      <View style={styles.buttons}>
        <Button
          label="Use my current location"
          variant="secondary"
          icon="crosshairs-gps"
          loading={locating}
          loadingLabel="Locating…"
          disabled={disabled}
          onPress={() => void locateDevice()}
          testID="area-use-device"
        />
        <Button
          label="Use map centre"
          variant="ghost"
          icon="image-filter-center-focus"
          disabled={disabled || locating}
          onPress={() => pick(viewportCentre)}
          testID="area-use-map-centre"
        />
      </View>
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        Using your location is optional: your device’s approximate position is sent once to
        OrenjiTrade, which snaps it to a ~1 km grid. It is never stored on this device or shown to
        anyone; collectors only ever see an approximate area.
      </Text>
      {deviceMessage ? (
        <FormMessage tone={deviceMessage.tone} testID="area-device-message">
          {deviceMessage.text}
        </FormMessage>
      ) : null}

      <View
        style={styles.presets}
        accessibilityRole="toolbar"
        accessibilityLabel="Jump to a city"
        testID="area-cities"
      >
        <Text style={[textStyle('sm'), styles.presetsLabel, { color: palette.ink }]}>
          Jump to a city
        </Text>
        <View style={styles.presetList}>
          {CITY_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              label={preset.label}
              tone="outline"
              selected={selectedPreset?.id === preset.id}
              disabled={disabled}
              onPress={() => choosePreset(preset)}
              testID={`area-city-${preset.id}`}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
  },
  statusText: { flex: 1, fontWeight: fontWeight.medium },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: -spacing[2] },
  summary: { fontWeight: fontWeight.medium },
  grow: { flex: 1 },
  buttons: { gap: spacing[2] },
  presets: { gap: spacing[2] },
  presetsLabel: { fontWeight: fontWeight.semibold },
  presetList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
