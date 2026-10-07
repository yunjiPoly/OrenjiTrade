import { FormMessage } from '@/src/components/ui/FormControls';

import { useLegalTexts } from './legalTexts';

/**
 * Shown on every legal page until counsel reviewed the drafts, in the active legal language
 * (same text as the web); the French pages add that the translation itself awaits the lawyer's
 * validation (a marking only, never legal content), as its own line under the banner text.
 */
export function LegalDraftBanner() {
  const texts = useLegalTexts();
  return (
    <FormMessage
      tone="info"
      testID="legal-draft-banner"
      detail={texts.translationNotice}
      detailTestID="legal-translation-notice"
    >
      {texts.draftBanner}
    </FormMessage>
  );
}
