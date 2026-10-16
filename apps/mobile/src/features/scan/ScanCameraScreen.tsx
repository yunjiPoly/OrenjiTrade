import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSnackbar } from '@/src/components/ui/Snackbar';
import { Text } from '@/src/components/ui/Text';
import { useLeaveGuard } from '@/src/features/inventory/import/useLeaveGuard';
import { fontWeight, PINNED_MAX_FONT_SCALE, useTheme } from '@/src/theme';

import { CameraFrameOverlay } from './CameraFrameOverlay';
import { fitCardFrame } from './cameraLayout';
import { CameraNotice, type CameraProblem } from './CameraNotice';
import { cropsUnderFrame, type Size, type ViewRect } from './frameMapping';
import { LeaveScanSheet } from './LeaveScanSheet';
import { ScanBottomBar } from './ScanBottomBar';
import { SCAN_COPY } from './scanCopy';
import { pickScanPhotos } from './scanPhotos';
import { scanRunner } from './scanRunner';
import { scanCounts } from './scanSession';
import { useScanStore } from './scanStore';
import { ScanTray } from './ScanTray';
import { useScanEffects } from './useScanEffects';
import { useScanTileSheets } from './useScanTileSheets';

/** Where the review (30) and the search inside the scan live (part B of the screens). */
export const SCAN_REVIEW_ROUTE = '/scan/review';
export const SCAN_SEARCH_ROUTE = '/scan/search';

/** What dims the round buttons of the top bar over the picture (the mockup's). */
const ROUND_BACKGROUND = 'rgba(20, 18, 16, 0.6)';
const ROUND_BORDER = 'rgba(255, 255, 255, 0.16)';

type CameraState = 'STARTING' | 'READY' | 'NO_CAMERA' | 'FAILED';

/**
 * Scan cards (mockup screen 27, owner spec 2026-10-15, sections 3.2 and 4): the camera fills the
 * screen under a card-shaped frame; each tap of the shutter takes one still photo (no live
 * processing, no EXIF) and adds a "Reading…" tile to the tray at once, read on the phone while
 * the collector keeps shooting. "Photos" adds photos already taken to the same tray. Tapping a
 * tile fixes or checks it in place (28, the lists, 29); "Review {n}" opens the review (30).
 * Closing with cards in the tray asks first; leaving ends the scan and deletes its photos.
 */
export function ScanCameraScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const { palette } = useTheme();
  const session = useScanStore((state) => state.session);
  const counts = scanCounts(session);
  const hasCards = session.tiles.length > 0;

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [camera, setCamera] = useState<CameraState>('STARTING');
  const [mount, setMount] = useState(0);
  const [torch, setTorch] = useState(false);
  const [focused, setFocused] = useState(true);
  const [screen, setScreen] = useState<Size | null>(null);
  const [slot, setSlot] = useState<ViewRect | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [exit, setExit] = useState(false);
  const capturing = useRef<Promise<void>>(Promise.resolve());

  useScanEffects();

  // The permission is asked when the camera opens; there is no explainer page.
  const asking =
    permission !== null &&
    !permission.granted &&
    permission.status === 'undetermined' &&
    permission.canAskAgain;
  useEffect(() => {
    if (asking) {
      void requestPermission();
    }
  }, [asking, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, [])
  );

  // A scan left with nothing in its tray ends here (the photos of removed tiles are deleted).
  useEffect(
    () => () => {
      if (useScanStore.getState().session.tiles.length === 0) {
        scanRunner.endScan();
      }
    },
    []
  );

  const leaveScreen = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/items/new');
    }
  }, [router]);

  // The back gesture, the header's back and Android's back key ask first while the tray holds
  // cards, like Close.
  const guard = useLeaveGuard(hasCards);
  const askingToLeave = leaving || guard.asking;

  // Leaves once the ended scan is rendered: the guard no longer holds the screen then.
  const left = useRef(false);
  useEffect(() => {
    if (exit && !hasCards && !left.current) {
      left.current = true;
      leaveScreen();
    }
  }, [exit, hasCards, leaveScreen]);

  const close = () => {
    if (hasCards) {
      setLeaving(true);
    } else {
      scanRunner.endScan();
      leaveScreen();
    }
  };

  const confirmLeave = () => {
    const held = guard.asking;
    setLeaving(false);
    scanRunner.endScan();
    if (held) {
      guard.leave();
    } else {
      setExit(true);
    }
  };

  const stay = () => {
    setLeaving(false);
    guard.stay();
  };

  const { openTile, sheets } = useScanTileSheets({
    onSearch: (tileId) => router.push({ pathname: SCAN_SEARCH_ROUTE, params: { tileId } }),
  });

  const frame = slot && screen ? fitCardFrame(slot, screen.width) : null;
  const granted = permission?.granted === true;
  const problem: CameraProblem | null =
    permission === null || asking
      ? 'STARTING'
      : !granted
        ? 'REFUSED'
        : camera === 'NO_CAMERA'
          ? 'NO_CAMERA'
          : camera === 'FAILED'
            ? 'FAILED'
            : null;
  const showCamera = granted && camera !== 'NO_CAMERA' && camera !== 'FAILED';
  const canShoot = showCamera && camera === 'READY' && frame !== null && screen !== null;

  const onCameraReady = async () => {
    try {
      // iOS reports the lenses of its back camera: none on a phone without a camera (the
      // simulator, where expo-camera would hand over a generated black picture).
      const lenses =
        Platform.OS === 'ios' ? await cameraRef.current?.getAvailableLensesAsync() : undefined;
      setCamera(Array.isArray(lenses) && lenses.length === 0 ? 'NO_CAMERA' : 'READY');
    } catch {
      setCamera('READY');
    }
  };

  const shoot = () => {
    const view = cameraRef.current;
    if (!view || !frame || !screen) {
      return;
    }
    // Taps queue their photos: the shutter never waits for a reading, only for the camera.
    capturing.current = capturing.current.then(async () => {
      try {
        const picture = await view.takePictureAsync({ exif: false, quality: 1 });
        const photo = {
          uri: picture.uri,
          width: picture.width,
          height: picture.height,
          owned: true,
        };
        scanRunner.addPhotos([
          { photo, source: 'CAMERA', crops: cropsUnderFrame(frame, screen, photo) },
        ]);
      } catch {
        snackbar.show(SCAN_COPY.shotFailed, { tone: 'error' });
      }
    });
  };

  const addFromPhotos = async () => {
    try {
      const picked = await pickScanPhotos();
      if (picked && picked.length > 0) {
        scanRunner.addPhotos(picked);
      }
    } catch {
      snackbar.show(SCAN_COPY.photosFailed, { tone: 'error' });
    }
  };

  const onRootLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setScreen((current) =>
      current && current.width === width && current.height === height ? current : { width, height }
    );
  };
  const onSlotLayout = (event: LayoutChangeEvent) => {
    const { x, y, width, height } = event.nativeEvent.layout;
    setSlot((current) =>
      current &&
      current.x === x &&
      current.y === y &&
      current.width === width &&
      current.height === height
        ? current
        : { x, y, width, height }
    );
  };

  return (
    <View
      style={[styles.root, { backgroundColor: palette.background }]}
      onLayout={onRootLayout}
      testID="screen-scan-camera"
    >
      {showCamera ? (
        <CameraView
          key={mount}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          mode="picture"
          active={focused}
          enableTorch={torch && camera === 'READY'}
          animateShutter
          onCameraReady={() => void onCameraReady()}
          onMountError={() => setCamera('FAILED')}
          testID="scan-camera-view"
        />
      ) : null}
      {showCamera && frame && screen ? <CameraFrameOverlay frame={frame} size={screen} /> : null}

      <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.title, { color: palette.ink, top: insets.top + 4 }]}
        >
          {SCAN_COPY.title}
        </Text>
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={SCAN_COPY.close}
            onPress={close}
            style={({ pressed }) => [styles.round, pressed && styles.pressed]}
            testID="scan-close"
          >
            <MaterialCommunityIcons name="chevron-left" size={26} color={palette.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="togglebutton"
            accessibilityLabel={SCAN_COPY.light}
            accessibilityState={{ checked: torch, disabled: camera !== 'READY' }}
            disabled={camera !== 'READY' || !showCamera}
            onPress={() => setTorch((on) => !on)}
            style={({ pressed }) => [
              styles.round,
              torch && { backgroundColor: palette.warning },
              pressed && styles.pressed,
              (camera !== 'READY' || !showCamera) && styles.disabled,
            ]}
            testID="scan-light"
          >
            <MaterialCommunityIcons
              name={torch ? 'flash' : 'flash-outline'}
              size={20}
              color={torch ? palette.onPrimary : palette.ink}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.slot} onLayout={onSlotLayout} testID="scan-frame-slot">
        {problem ? (
          <View style={styles.notice}>
            <CameraNotice
              problem={problem}
              onChoosePhotos={() => void addFromPhotos()}
              onOpenSettings={() => void Linking.openSettings().catch(() => undefined)}
              onRetry={() => {
                setCamera('STARTING');
                setMount((key) => key + 1);
              }}
            />
          </View>
        ) : null}
      </View>

      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.hint, { color: palette.ink }]}
      >
        {SCAN_COPY.hint}
      </Text>
      <ScanTray tiles={session.tiles} counts={counts} onTile={openTile} />
      <View style={styles.bar}>
        <ScanBottomBar
          counts={counts}
          canShoot={canShoot}
          onPhotos={() => void addFromPhotos()}
          onShoot={shoot}
          onReview={() => router.push(SCAN_REVIEW_ROUTE)}
        />
      </View>
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        style={[styles.tip, { color: palette.textMuted, marginBottom: insets.bottom + 12 }]}
      >
        {SCAN_COPY.tip}
      </Text>

      {sheets}
      <LeaveScanSheet
        visible={askingToLeave}
        counts={{ ...counts, cards: counts.cards + counts.reading }}
        onStay={stay}
        onLeave={confirmLeave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 8 },
  title: {
    position: 'absolute',
    left: 60,
    right: 60,
    lineHeight: 44,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: fontWeight.semibold,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ROUND_BORDER,
    backgroundColor: ROUND_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: { flex: 1, minHeight: 120, justifyContent: 'center' },
  notice: { paddingHorizontal: 24 },
  hint: { textAlign: 'center', fontSize: 13, lineHeight: 18, marginHorizontal: 24, marginTop: 4 },
  bar: { marginTop: 14 },
  tip: { textAlign: 'center', fontSize: 12, lineHeight: 16, marginHorizontal: 24, marginTop: 14 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
