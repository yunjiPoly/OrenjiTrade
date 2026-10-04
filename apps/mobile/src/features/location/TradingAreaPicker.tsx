import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { messageOf } from '@/src/api/errorMessages';
import { useSaveTradingArea } from '@/src/api/hooks/location';
import type { MyLocationResponse } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { FormMessage, RadioGroup, type RadioOption } from '@/src/components/ui/FormControls';
import { Stepper } from '@/src/components/ui/Stepper';
import { CITY_PRESETS, MAX_RADIUS_KM, MIN_RADIUS_KM, nextRadius } from '@/src/lib/location';
import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { readApproximatePosition } from './deviceLocation';
import type { AreaDraft } from './tradingArea';

export interface TradingAreaPickerProps {
  value: AreaDraft;
  onChange: (value: AreaDraft) => void;
  /** `GET /me/location` (label of the saved area, whether one exists). */
  location: MyLocationResponse | undefined;
  disabled?: boolean;
}

type DeviceMessage = { tone: 'error' | 'success'; text: string } | null;

/**
 * Trading-area picker (same mechanism as the web: a public city centre and a radius of 1–50 km,
 * saved with `PUT /me/location/trading-area`). "Use my current location" reads the device ONCE at
 * reduced accuracy and sends it straight to the API, which snaps it; the app only shows the
 * server's public label, never coordinates (ADR 0004).
 */
export function TradingAreaPicker({ value, onChange, location, disabled }: TradingAreaPickerProps) {
  const { palette } = useTheme();
  const save = useSaveTradingArea();
  const [locating, setLocating] = useState(false);
  const [deviceMessage, setDeviceMessage] = useState<DeviceMessage>(null);
  const saved = location?.tradingArea;

  const options: RadioOption<string>[] = [
    ...(saved && (value.center === 'saved' || saved.source === 'DEVICE')
      ? [
          {
            value: 'saved',
            label: saved.label ? `Saved area · ${saved.label}` : 'Saved area',
            help:
              saved.source === 'DEVICE'
                ? 'From your device location, snapped by OrenjiTrade.'
                : undefined,
          },
        ]
      : []),
    ...CITY_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
  ];

  const locateDevice = async () => {
    setLocating(true);
    setDeviceMessage(null);
    try {
      const position = await readApproximatePosition();
      if (position.status === 'denied') {
        setDeviceMessage({
          tone: 'error',
          text: 'Location permission was denied. Choose a city instead, or allow location in your device settings.',
        });
        return;
      }
      if (position.status === 'unavailable') {
        setDeviceMessage({
          tone: 'error',
          text: 'Your location is not available right now. Choose a city instead.',
        });
        return;
      }
      const result = await save.mutateAsync({
        lat: position.lat,
        lng: position.lng,
        radiusKm: value.radiusKm,
        source: 'DEVICE',
      });
      onChange({ center: 'saved', radiusKm: value.radiusKm });
      setDeviceMessage({
        tone: 'success',
        text: result.tradingArea?.label
          ? `Trading area set near ${result.tradingArea.label}.`
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

      <RadioGroup
        label="Centre of your trading area"
        options={options}
        value={value.center}
        onChange={(center) => onChange({ ...value, center })}
        disabled={disabled}
        testID="area-centre"
      />

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
      <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
        Your device’s approximate position is sent once to OrenjiTrade, which snaps it to a ~1 km
        grid. It is never stored on this device or shown to anyone; collectors only ever see an
        approximate area.
      </Text>
      {deviceMessage ? (
        <FormMessage tone={deviceMessage.tone} testID="area-device-message">
          {deviceMessage.text}
        </FormMessage>
      ) : null}
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
});
