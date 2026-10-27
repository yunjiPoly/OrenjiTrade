import { Text } from '@/src/components/ui/Text';
import { SettingsNote, useNoteTextStyle } from '@/src/features/settings/SettingsList';
import { fontWeight } from '@/src/theme';

import { useLegalTexts } from './legalTexts';

/** The English banner's words (mockup v50 screens 58 and 59). */
export const DRAFT_BANNER_EN = {
  strong: 'Draft.',
  text: 'Requires review by qualified legal counsel before launch.',
} as const;

/**
 * Shown on every legal page until counsel reviewed the drafts (stage R13: the amber note of
 * mockup v50). In English, "Draft." and what it needs; the French pages keep their own banner and
 * add that the translation itself awaits the lawyer's validation (a marking only, never legal
 * content), as its own line.
 */
export function LegalDraftBanner() {
  const texts = useLegalTexts();
  const style = useNoteTextStyle('draft');
  return (
    <SettingsNote tone="draft" icon="alert-outline" testID="legal-draft-banner">
      {texts.language === 'en' ? (
        <Text style={style}>
          <Text style={{ fontWeight: fontWeight.bold }}>{DRAFT_BANNER_EN.strong}</Text>{' '}
          {DRAFT_BANNER_EN.text}
        </Text>
      ) : (
        <>
          <Text style={style}>{texts.draftBanner}</Text>
          {texts.translationNotice ? (
            <Text testID="legal-translation-notice" style={style}>
              {texts.translationNotice}
            </Text>
          ) : null}
        </>
      )}
    </SettingsNote>
  );
}
