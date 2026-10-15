import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ConversationSubject } from '@/src/api/types';
import { BottomSheet } from '@/src/components/ui/BottomSheet';
import { Stepper } from '@/src/components/ui/Stepper';
import { Text, TextInput } from '@/src/components/ui/Text';
import { fontFamily, fontWeight, PINNED_MAX_FONT_SCALE, spacing, useTheme } from '@/src/theme';

import { MARK_SOLD_COPY, PINNED_COPY } from './chatCopy';
import { cleanTracking, markSoldSentence, TRACKING_MAX, trackingProblem } from './dealRules';
import { SubjectThumb } from './SubjectThumb';

/**
 * Mark as sold (owner spec 2026-10-14, section 10, mockup screen 25), the seller only: the card row
 * ("{code} · {n} copy" or "copies"), a "Copies sold" stepper when there is more than one, "Tracking
 * number · optional" in mono ("So {buyer} can follow the package"), the sentence of what happens
 * next, an orange "Mark as sold" and "Not yet". A deck core sells as one.
 */
export function MarkSoldSheet({
  visible,
  subject,
  buyer,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  subject: ConversationSubject;
  /** The buyer's handle. */
  buyer: string;
  busy: boolean;
  /** Why the last attempt failed. */
  error: string | null;
  onConfirm: (sale: { quantity: number; trackingNumber: string | null }) => void;
  onClose: () => void;
}) {
  const { palette } = useTheme();
  const copies = Math.max(1, subject.copies ?? 1);
  const [quantity, setQuantity] = useState(1);
  const [tracking, setTracking] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // Opened again: it starts over (render-time reset, no effect).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setQuantity(1);
      setTracking('');
      setProblem(null);
    }
  }
  const core = subject.kind === 'DECK_CORE';
  const line = core
    ? PINNED_COPY.deckCore
    : [subject.printingCode, MARK_SOLD_COPY.copies(copies)].filter(Boolean).join(' · ');

  const confirm = () => {
    const issue = trackingProblem(tracking);
    if (issue) {
      setProblem(issue);
      return;
    }
    const cleaned = cleanTracking(tracking);
    onConfirm({ quantity: core ? 1 : quantity, trackingNumber: cleaned || null });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={MARK_SOLD_COPY.title}
      testID="mark-sold-sheet"
      avoidKeyboard
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.card,
            { backgroundColor: palette.background, borderColor: palette.border },
          ]}
        >
          <SubjectThumb subject={subject} size="bar" testID="mark-sold-thumb" />
          <View style={styles.cardText}>
            <Text numberOfLines={1} style={[styles.cardName, { color: palette.ink }]}>
              {subject.name}
            </Text>
            <Text testID="mark-sold-line" style={[styles.cardLine, { color: palette.textMuted }]}>
              {line}
            </Text>
          </View>
        </View>

        {!core && copies > 1 ? (
          <View style={styles.stepperRow}>
            <Text style={[styles.label, { color: palette.ink }]}>{MARK_SOLD_COPY.copiesSold}</Text>
            <Stepper
              label={MARK_SOLD_COPY.copiesSold}
              value={quantity}
              min={1}
              max={copies}
              onChange={setQuantity}
              testID="mark-sold-quantity"
            />
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={[styles.label, { color: palette.ink }]}>
            {MARK_SOLD_COPY.trackingLabel}{' '}
            <Text style={[styles.optional, { color: palette.textMuted }]}>
              · {MARK_SOLD_COPY.optional}
            </Text>
          </Text>
          <TextInput
            value={tracking}
            onChangeText={(value) => {
              setTracking(value);
              setProblem(null);
            }}
            accessibilityLabel={`${MARK_SOLD_COPY.trackingLabel}, ${MARK_SOLD_COPY.optional}`}
            placeholder={MARK_SOLD_COPY.trackingPlaceholder(buyer)}
            placeholderTextColor={palette.textDisabled}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={TRACKING_MAX + 16}
            testID="mark-sold-tracking"
            style={[
              styles.tracking,
              tracking ? styles.trackingMono : null,
              {
                color: palette.ink,
                borderColor: problem ? palette.danger : palette.borderStrong,
                backgroundColor: palette.background,
              },
            ]}
          />
          {problem ? (
            <Text accessibilityRole="alert" style={[styles.note, { color: palette.danger }]}>
              {problem}
            </Text>
          ) : null}
        </View>

        <Text testID="mark-sold-sentence" style={[styles.sentence, { color: palette.textMuted }]}>
          {markSoldSentence(subject, quantity, buyer)}
        </Text>
        {error ? (
          <Text
            accessibilityRole="alert"
            testID="mark-sold-error"
            style={[styles.note, { color: palette.danger }]}
          >
            {error}
          </Text>
        ) : null}
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={MARK_SOLD_COPY.confirm}
        aria-busy={busy}
        disabled={busy}
        onPress={confirm}
        testID="mark-sold-confirm"
        style={({ pressed }) => [
          styles.primary,
          { backgroundColor: palette.primary },
          (pressed || busy) && styles.pressed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.primaryLabel, { color: palette.onPrimary }]}
        >
          {MARK_SOLD_COPY.confirm}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={MARK_SOLD_COPY.notYet}
        onPress={onClose}
        testID="mark-sold-cancel"
        style={({ pressed }) => [
          styles.secondary,
          { borderColor: palette.borderStrong },
          pressed && styles.pressed,
        ]}
      >
        <Text
          maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
          style={[styles.secondaryLabel, { color: palette.ink }]}
        >
          {MARK_SOLD_COPY.notYet}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // The sheet's content scrolls at the largest text sizes; its two buttons stay in reach.
  scroll: { flexShrink: 1 },
  scrollContent: { gap: spacing[3] },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  cardName: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  cardLine: { fontSize: 13, lineHeight: 18 },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    flexWrap: 'wrap',
  },
  field: { gap: 6 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: fontWeight.semibold },
  optional: { fontWeight: fontWeight.medium },
  tracking: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  trackingMono: { fontFamily: fontFamily.mono },
  note: { fontSize: 13, lineHeight: 18 },
  sentence: { fontSize: 14, lineHeight: 20 },
  primary: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryLabel: { fontSize: 16, lineHeight: 21, fontWeight: fontWeight.bold },
  secondary: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.8 },
});
