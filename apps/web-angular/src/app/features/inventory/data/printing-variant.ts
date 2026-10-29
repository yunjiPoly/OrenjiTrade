import type { CardSuggestion, PrintingSummary } from '@orenji/api-client';
import { editionLabel, finishLabel, languageLabel } from '../../../shared/catalog/catalog-labels';
import { printingCode } from '../../../shared/inventory/inventory-labels';

type PrintingFacts = Pick<
  PrintingSummary,
  'id' | 'printingCode' | 'setCode' | 'collectorNumber' | 'edition' | 'language' | 'finish'
>;

/**
 * What tells apart printings that carry the same code (U2: a 1st Edition and an Unlimited
 * "AZR-EN011", a reverse holo): their edition, language or finish when those differ among the
 * twins; null for a code no other printing has. The phone's rule (`printingVariant` of
 * `apps/mobile/src/features/inventory/PrintingPicker.tsx`), ported as it is.
 */
export function printingVariant(
  printing: PrintingFacts,
  printings: readonly PrintingFacts[],
): string | null {
  const code = printingCode(printing);
  const twins = printings.filter(
    (other) => other.id !== printing.id && printingCode(other) === code,
  );
  if (!code || twins.length === 0) {
    return null;
  }
  const parts: string[] = [];
  if (twins.some((other) => (other.edition ?? '') !== (printing.edition ?? ''))) {
    parts.push(editionLabel(printing.edition));
  }
  if (twins.some((other) => (other.language ?? '') !== (printing.language ?? ''))) {
    parts.push(languageLabel(printing.language));
  }
  if (twins.some((other) => (other.finish ?? '') !== (printing.finish ?? ''))) {
    parts.push(finishLabel(printing.finish));
  }
  const words = parts.filter((part) => part && part !== '—');
  return words.length > 0 ? words.join(' · ') : null;
}

type SuggestionFacts = Pick<
  CardSuggestion,
  'printingId' | 'printingCode' | 'setCode' | 'edition' | 'language' | 'finish'
>;

/** The same rule for the exact printings of a search (`/cards/suggest` names their facts). */
export function suggestionVariant(
  suggestion: SuggestionFacts,
  suggestions: readonly SuggestionFacts[],
): string | null {
  const facts = (s: SuggestionFacts): PrintingFacts => ({
    id: s.printingId,
    printingCode: s.printingCode,
    setCode: s.setCode,
    edition: s.edition ?? undefined,
    language: s.language ?? undefined,
    finish: s.finish ?? undefined,
  });
  return printingVariant(facts(suggestion), suggestions.map(facts));
}
