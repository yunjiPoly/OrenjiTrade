import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

import { LEGAL_LANGUAGES, useLegalLanguage, type LegalLanguage } from './legalLanguage';

const NAMES: Record<LegalLanguage, string> = { en: 'English', fr: 'Français' };

/** The EN / FR switch of the legal screens (web: `app-legal-language-switch`). */
export function LegalLanguageSwitch({ testID = 'legal-language-switch' }: { testID?: string }) {
  const { palette } = useTheme();
  const { language, set } = useLegalLanguage();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Language / Langue"
      testID={testID}
      style={[styles.group, { borderColor: palette.border, backgroundColor: palette.surface }]}
    >
      {LEGAL_LANGUAGES.map((option) => {
        const selected = option === language;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityLabel={NAMES[option]}
            accessibilityState={{ selected, checked: selected }}
            aria-checked={selected}
            onPress={() => set(option)}
            testID={`${testID}-${option}`}
            style={({ pressed }) => [
              styles.option,
              selected && { backgroundColor: palette.primary },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                textStyle('sm'),
                styles.label,
                { color: selected ? palette.onPrimary : palette.ink },
              ]}
            >
              {option.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: radius.pill,
    padding: 2,
  },
  option: {
    minWidth: 44,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
  },
  label: { fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
