import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/ui/Text';
import { fontWeight, useTheme } from '@/src/theme';

import { LEGAL_LANGUAGES, useLegalLanguage, type LegalLanguage } from './legalLanguage';

const NAMES: Record<LegalLanguage, string> = { en: 'English', fr: 'Français' };

/**
 * The English | Français switch of the legal screens (web: `app-legal-language-switch`; stage R13,
 * mockup v50 screens 58 and 59): a segmented control as wide as the page, the chosen language
 * filled. Only the legal documents have French texts (owner, 2026-10-20: no new French work).
 */
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
              selected && { backgroundColor: palette.settings.segmentSelected },
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: selected
                    ? palette.settings.segmentSelectedText
                    : palette.settings.segmentText,
                },
              ]}
            >
              {NAMES[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  option: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    paddingHorizontal: 12,
  },
  label: { fontSize: 14, lineHeight: 19, fontWeight: fontWeight.semibold },
  pressed: { opacity: 0.7 },
});
