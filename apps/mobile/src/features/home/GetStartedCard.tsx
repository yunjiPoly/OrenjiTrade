import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import {
  PINNED_MAX_FONT_SCALE,
  TITLE_MAX_FONT_SCALE,
  fontFamily,
  fontWeight,
  spacing,
  useStackedRows,
  useTheme,
} from '@/src/theme';

import type { GetStartedSteps } from './getStarted';
import { HOME_COPY } from './homeCopy';

const COPY = HOME_COPY.getStarted;

export interface GetStartedCardProps {
  steps: GetStartedSteps;
  onHide: () => void;
  /** Step 1: Settings › Location ("Choose", or "Turn on" for a location hidden from the map). */
  onProvince: () => void;
  /** Step 2: Add cards (3). */
  onAddCards: () => void;
  /** Step 3: Search with the keyboard up. */
  onAddWish: () => void;
}

/**
 * Get started (mockup v50 screen 10c): the title and its line, "Hide these steps", a 3-part
 * progress bar with "{done} of 3", and the three steps. A done step shows a teal check and its
 * title in grey; a step still to do shows its number and a button.
 */
export function GetStartedCard({
  steps,
  onHide,
  onProvince,
  onAddCards,
  onAddWish,
}: GetStartedCardProps) {
  const { palette } = useTheme();
  const province = steps.province;
  return (
    <View
      testID="home-get-started"
      style={[
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.home.getStartedBorder },
      ]}
    >
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
            style={[styles.title, { color: palette.ink }]}
          >
            {COPY.title}
          </Text>
          <Text style={[styles.intro, { color: palette.textMuted }]}>{COPY.intro}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={COPY.hide}
          onPress={onHide}
          testID="home-get-started-hide"
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="close" size={20} color={palette.textMuted} />
        </Pressable>
      </View>

      <View style={styles.progressRow}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={COPY.progressLabel}
          accessibilityValue={{
            min: 0,
            max: 3,
            now: steps.done,
            text: COPY.progressValue(steps.done),
          }}
          style={styles.progress}
          testID="home-get-started-progress"
        >
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={[
                styles.segment,
                {
                  backgroundColor: index < steps.done ? palette.primary : palette.home.chipBorder,
                },
              ]}
            />
          ))}
        </View>
        <Text
          importantForAccessibility="no"
          accessibilityElementsHidden
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.count, { color: palette.textMuted }]}
        >
          {COPY.progress(steps.done)}
        </Text>
      </View>

      <View>
        <Step
          number={1}
          done={province.state === 'done'}
          title={COPY.province.title}
          line={
            province.state === 'done'
              ? province.place
              : province.state === 'hidden'
                ? COPY.province.hidden
                : COPY.province.todo
          }
          action={
            province.state === 'done'
              ? null
              : {
                  label: province.state === 'hidden' ? COPY.province.turnOn : COPY.province.choose,
                  onPress: onProvince,
                  filled: false,
                }
          }
          testID="home-step-province"
        />
        <Step
          number={2}
          done={steps.card}
          title={COPY.card.title}
          line={COPY.card.todo}
          action={
            steps.card ? null : { label: COPY.card.action, onPress: onAddCards, filled: true }
          }
          testID="home-step-card"
        />
        <Step
          number={3}
          done={steps.wish}
          title={COPY.wish.title}
          line={COPY.wish.todo}
          action={
            steps.wish ? null : { label: COPY.wish.action, onPress: onAddWish, filled: false }
          }
          testID="home-step-wish"
        />
      </View>
    </View>
  );
}

function Step({
  number,
  done,
  title,
  line,
  action,
  testID,
}: {
  number: number;
  done: boolean;
  title: string;
  line: string;
  action: { label: string; onPress: () => void; filled: boolean } | null;
  testID: string;
}) {
  const { palette } = useTheme();
  // At the largest text sizes the button goes under the step's words, which keep the row's width.
  const stacked = useStackedRows();
  return (
    <View
      style={[styles.step, stacked && styles.stepStacked, { borderTopColor: palette.border }]}
      testID={`${testID}${done ? '-done' : '-todo'}`}
    >
      <View
        accessible
        accessibilityLabel={`${title}${done ? COPY.done : ''}. ${line}`}
        style={[styles.stepMain, stacked && styles.stepMainStacked]}
      >
        {done ? (
          <View style={[styles.mark, { backgroundColor: palette.home.stepDone }]}>
            <MaterialCommunityIcons name="check" size={16} color={palette.accent} />
          </View>
        ) : (
          <View style={[styles.mark, styles.number, { borderColor: palette.borderStrong }]}>
            <Text
              maxFontSizeMultiplier={1.4}
              style={[styles.numberText, { color: palette.home.chipText }]}
            >
              {number}
            </Text>
          </View>
        )}
        <View style={styles.stepText}>
          <Text style={[styles.stepTitle, { color: done ? palette.textMuted : palette.ink }]}>
            {title}
          </Text>
          <Text style={[styles.stepLine, { color: palette.textMuted }]}>{line}</Text>
        </View>
      </View>
      {action ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={4}
          testID={`${testID}-action`}
          style={({ pressed }) => [
            styles.action,
            action.filled
              ? { backgroundColor: palette.primary, borderColor: palette.primary }
              : { borderColor: palette.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.6}
            style={[
              styles.actionText,
              { color: action.filled ? palette.onPrimary : palette.primary },
            ]}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: spacing[4], gap: spacing[3] },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  titleText: { flex: 1, minWidth: 0, gap: 4 },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  intro: { fontSize: 13, lineHeight: 18 },
  close: {
    width: 44,
    height: 44,
    marginTop: -12,
    marginRight: -12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progress: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  count: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.semibold },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 60,
    paddingVertical: spacing[2],
    borderTopWidth: 1,
    flexWrap: 'wrap',
  },
  stepMain: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  stepStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  stepMainStacked: { flex: 0, alignSelf: 'stretch', minWidth: 0, alignItems: 'flex-start' },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { borderWidth: 2 },
  numberText: { fontSize: 13, lineHeight: 17, fontWeight: fontWeight.bold },
  stepText: { flex: 1, minWidth: 0, gap: 2 },
  stepTitle: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  stepLine: { fontSize: 12, lineHeight: 16 },
  action: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.bold },
  pressed: { opacity: 0.75 },
});
