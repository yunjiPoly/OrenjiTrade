import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/src/components/ui/Button';
import { PillButton } from '@/src/components/ui/PillButton';
import { Text } from '@/src/components/ui/Text';
import { PINNED_MAX_FONT_SCALE, spacing, textStyle, useTheme } from '@/src/theme';

import { SCAN_COPY } from './scanCopy';

/** Why the camera cannot take photos (or not yet). */
export type CameraProblem = 'STARTING' | 'REFUSED' | 'NO_CAMERA' | 'FAILED';

export interface CameraNoticeProps {
  problem: CameraProblem;
  onChoosePhotos: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}

/**
 * What the camera's frame shows when the camera cannot take photos (spec 4, screen 27): the
 * camera starting; the permission refused (one short line, a button to the phone's Settings and
 * "Choose from photos"; there is no explainer page); a phone without a camera (the simulator); a
 * camera that did not start ("Try again"). Photos already taken can always be added.
 */
export function CameraNotice({
  problem,
  onChoosePhotos,
  onOpenSettings,
  onRetry,
}: CameraNoticeProps) {
  const { palette } = useTheme();
  if (problem === 'STARTING') {
    return (
      <View style={styles.root} accessibilityLiveRegion="polite" testID="scan-camera-starting">
        <ActivityIndicator color={palette.accent} />
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[textStyle('sm'), styles.text, { color: palette.textMuted }]}
        >
          {SCAN_COPY.cameraStarting}
        </Text>
      </View>
    );
  }
  const line =
    problem === 'REFUSED'
      ? SCAN_COPY.permissionRefused
      : problem === 'NO_CAMERA'
        ? SCAN_COPY.noCamera
        : SCAN_COPY.cameraFailed;
  return (
    <View
      style={[
        styles.root,
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
      accessibilityRole="alert"
      testID={`scan-camera-${problem.toLowerCase().replace('_', '-')}`}
    >
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[textStyle('md'), styles.text, { color: palette.ink }]}
      >
        {line}
      </Text>
      {problem === 'REFUSED' ? (
        <Button
          label={SCAN_COPY.openSettings}
          variant="secondary"
          onPress={onOpenSettings}
          testID="scan-camera-settings"
        />
      ) : null}
      {problem === 'FAILED' ? (
        <Button
          label={SCAN_COPY.tryAgain}
          variant="secondary"
          onPress={onRetry}
          testID="scan-camera-retry"
        />
      ) : null}
      <PillButton
        label={SCAN_COPY.chooseFromPhotos}
        icon="image-multiple-outline"
        onPress={onChoosePhotos}
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        testID="scan-camera-choose-photos"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: spacing[3], padding: spacing[4] },
  card: { borderRadius: 16, borderWidth: 1, alignSelf: 'stretch' },
  text: { textAlign: 'center', alignSelf: 'stretch' },
});
