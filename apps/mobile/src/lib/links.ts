import type { LegalDocument } from '@orenji/shared-types';
import * as Linking from 'expo-linking';

/** Public web origin; legal pages are served there (`docs/api/contracts/phase1-auth-users.md`). */
export const WEB_ORIGIN = 'https://www.orenjitrade.com';

/** `LegalDocument.url` is a web path such as `/legal/terms`. */
export function legalDocumentUrl(document: Pick<LegalDocument, 'url'>): string {
  const path = document.url.startsWith('/') ? document.url : `/${document.url}`;
  return `${WEB_ORIGIN}${path}`;
}

/** Opens an external https URL in the system browser; swallows "no handler" failures. */
export async function openExternalUrl(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
