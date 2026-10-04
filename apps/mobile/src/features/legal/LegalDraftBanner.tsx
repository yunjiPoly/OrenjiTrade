import { LEGAL_DRAFT_BANNER } from '@/src/legal/legalContent';

import { FormMessage } from '@/src/components/ui/FormControls';

/** Shown on every legal page until counsel reviewed the drafts (same text as the web). */
export function LegalDraftBanner() {
  return (
    <FormMessage tone="info" testID="legal-draft-banner">
      {LEGAL_DRAFT_BANNER}
    </FormMessage>
  );
}
