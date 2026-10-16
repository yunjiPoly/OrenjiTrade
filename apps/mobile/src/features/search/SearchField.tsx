import { MaterialCommunityIcons } from '@expo/vector-icons';
import { forwardRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View, type TextInputProps } from 'react-native';

import { Text, TextInput } from '@/src/components/ui/Text';
import { QUERY_MAX_LENGTH } from '@/src/lib/catalog';
import { PINNED_MAX_FONT_SCALE, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { MAP_COPY, TYPING_COPY } from './searchCopy';

/**
 * The search field of Search's map (mockup screen 11): it looks like the field, with the orange
 * magnifier and "Card name or code, like LOB-EN001", and opens the card search with the keyboard
 * up (screen 12).
 */
export function SearchFieldButton({
  label = MAP_COPY.field,
  onPress,
  testID = 'search-field',
}: {
  label?: string;
  onPress: () => void;
  testID?: string;
}) {
  const { palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={label}
      accessibilityHint={MAP_COPY.fieldHint}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.field,
        { backgroundColor: palette.surface, borderColor: palette.primary },
        pressed && styles.pressed,
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={22} color={palette.primary} />
      <Text
        maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
        numberOfLines={1}
        style={[textStyle('md'), styles.grow, { color: palette.textMuted }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export interface SearchInputProps extends Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  /** What the field searches, for screen readers ("Card name or code"). */
  label: string;
  /** "Cancel" beside the field (the card search); without it, none. */
  onCancel?: () => void;
  /** The field's border in the accent colour (the card search while typing). */
  highlighted?: boolean;
  testID?: string;
}

/**
 * The typing field of Search (screens 12 and 14): the magnifier, the text, a round "Clear search"
 * button while it holds text and, for the card search, "Cancel" beside it.
 */
export const SearchInput = forwardRef<ComponentRef<typeof TextInput>, SearchInputProps>(
  function SearchInput(
    { value, onChangeText, label, onCancel, highlighted = false, testID = 'search-input', ...rest },
    ref
  ) {
    const { palette } = useTheme();
    return (
      <View style={styles.row}>
        <View
          style={[
            styles.field,
            styles.grow,
            {
              backgroundColor: palette.surface,
              borderColor: highlighted ? palette.primary : palette.borderStrong,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="magnify"
            size={22}
            color={highlighted ? palette.primary : palette.textMuted}
          />
          <TextInput
            ref={ref}
            {...rest}
            value={value}
            onChangeText={onChangeText}
            accessibilityLabel={label}
            placeholderTextColor={palette.textDisabled}
            maxLength={QUERY_MAX_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
            style={[textStyle('md'), styles.input, { color: palette.ink }]}
            testID={testID}
          />
          {value.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={TYPING_COPY.clear}
              onPress={() => onChangeText('')}
              hitSlop={10}
              testID={`${testID}-clear`}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="close-circle" size={20} color={palette.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {onCancel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={TYPING_COPY.cancel}
            onPress={onCancel}
            hitSlop={8}
            testID={`${testID}-cancel`}
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
          >
            <Text
              maxFontSizeMultiplier={PINNED_MAX_FONT_SCALE}
              style={[textStyle('md'), { color: palette.ink }]}
            >
              {TYPING_COPY.cancel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 52,
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  grow: { flex: 1 },
  input: { flex: 1, minHeight: 48, paddingVertical: spacing[2] },
  clear: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancel: { minHeight: 44, justifyContent: 'center' },
  pressed: { opacity: 0.75 },
});
