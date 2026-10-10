import type { PrintingSummary } from '@orenji/api-client';
import { editionLabel, languageLabel } from '../catalog-labels';

/**
 * Which copy of a card (owner product change of 2026-10-08, sections 2 and 4): "Any printing"
 * (`printingId: null`), any printing of one rarity (`printingId: null`, `rarity` set) or one
 * printing (`printingId` set; the printing fixes its rarity, so `rarity` is `null`). The card
 * page's printing picker (S3) and the wish form share it; the card page mirrors it in the URL as
 * `?printing=` / `?rarity=`.
 */
export interface PrintingSelection {
  printingId: string | null;
  rarity: string | null;
}

export const ANY_PRINTING: PrintingSelection = { printingId: null, rarity: null };

/**
 * `?printing=any`: the card page link of an explicit "any printing" selection (a wishlist alert
 * for an "any printing" wish, a wish's own link). The page then shows "Any printing" and picks no
 * printing for the collector. Stage S3 makes that the page's default without the parameter.
 */
export const ANY_PRINTING_PARAM = 'any';

/**
 * The card page's query parameters for a selection, always explicit: `?printing=<id>`,
 * `?rarity=<rarity>` or `?printing=any`.
 */
export function selectionQuery(selection: PrintingSelection): Record<string, string> {
  if (selection.printingId) {
    return { printing: selection.printingId };
  }
  return selection.rarity ? { rarity: selection.rarity } : { printing: ANY_PRINTING_PARAM };
}

/**
 * The list filters of the picker; `''` = no filter. `code` is a printing code the collector typed
 * (a code can be shared by several printings: editions, rarities); it has no select of its own.
 */
export interface PrintingFilters {
  rarity: string;
  set: string;
  edition: string;
  language: string;
  code: string;
}

export const NO_FILTERS: PrintingFilters = {
  rarity: '',
  set: '',
  edition: '',
  language: '',
  code: '',
};

/** The filters with a select above the list. */
export type PrintingFacet = Exclude<keyof PrintingFilters, 'code'>;

/** The printings carrying a printing code (several when editions or rarities share it). */
export function printingsWithCode(
  printings: readonly PrintingSummary[],
  code: string | null | undefined,
): PrintingSummary[] {
  return code ? printings.filter((printing) => printing.printingCode === code) : [];
}

/**
 * The printing a typed printing code stands for: the only printing of the card with that code,
 * `null` when several share it (never a silent pick among them) or none has it.
 */
export function onlyPrintingWithCode(
  printings: readonly PrintingSummary[],
  code: string | null | undefined,
): PrintingSummary | null {
  const matches = printingsWithCode(printings, code);
  return matches.length === 1 ? matches[0] : null;
}

/** One option of a filter select. */
export interface FacetOption {
  value: string;
  label: string;
}

/** The filter options of a facet: distinct values of the printings, in first-seen order. */
export function facetOptions(
  printings: readonly PrintingSummary[],
  facet: PrintingFacet,
): FacetOption[] {
  const seen = new Map<string, string>();
  for (const printing of printings) {
    const option = facetOf(printing, facet);
    if (option && !seen.has(option.value)) {
      seen.set(option.value, option.label);
    }
  }
  return [...seen].map(([value, label]) => ({ value, label }));
}

function facetOf(printing: PrintingSummary, facet: PrintingFacet): FacetOption | null {
  switch (facet) {
    case 'rarity':
      return printing.rarity ? { value: printing.rarity, label: printing.rarity } : null;
    case 'set':
      return printing.setId
        ? {
            value: printing.setId,
            label: [printing.setCode, printing.setName].filter(Boolean).join(' · '),
          }
        : null;
    case 'edition':
      return printing.edition
        ? { value: printing.edition, label: editionLabel(printing.edition) }
        : null;
    case 'language':
      return printing.language
        ? { value: printing.language, label: languageLabel(printing.language) }
        : null;
  }
}

/** Whether a printing passes every set filter. */
export function passesFilters(printing: PrintingSummary, filters: PrintingFilters): boolean {
  return (
    (!filters.rarity || printing.rarity === filters.rarity) &&
    (!filters.set || printing.setId === filters.set) &&
    (!filters.edition || printing.edition === filters.edition) &&
    (!filters.language || printing.language === filters.language) &&
    (!filters.code || printing.printingCode === filters.code)
  );
}

/**
 * The printings to show: those passing the filters (plus the selected one, so a selection never
 * vanishes), printings with holders first when counts are known (S3), otherwise the API's order
 * (set release date).
 */
export function visiblePrintings(
  printings: readonly PrintingSummary[],
  filters: PrintingFilters,
  selectedId: string | null,
  holderCounts: Readonly<Record<string, number>> | null = null,
): PrintingSummary[] {
  const visible = printings.filter(
    (printing) => printing.id === selectedId || passesFilters(printing, filters),
  );
  if (!holderCounts) {
    return visible;
  }
  const held = (printing: PrintingSummary) => ((holderCounts[printing.id ?? ''] ?? 0) > 0 ? 0 : 1);
  return visible
    .map((printing, index) => ({ printing, index }))
    .sort((a, b) => held(a.printing) - held(b.printing) || a.index - b.index)
    .map((entry) => entry.printing);
}

/**
 * The selection after the rarity filter changed: a selected printing of another rarity gives way
 * to "any printing of this rarity"; without a selected printing the rarity becomes the selection.
 */
export function selectionForRarity(
  selection: PrintingSelection,
  rarity: string,
  printings: readonly PrintingSummary[],
): PrintingSelection {
  if (selection.printingId) {
    const printing = printings.find((candidate) => candidate.id === selection.printingId);
    if (printing && (!rarity || printing.rarity === rarity)) {
      return selection;
    }
  }
  return { printingId: null, rarity: rarity || null };
}

/** The selection normalised against the card's printings (unknown printing: any printing). */
export function normaliseSelection(
  selection: PrintingSelection | null | undefined,
  printings: readonly PrintingSummary[],
): PrintingSelection {
  if (!selection) {
    return ANY_PRINTING;
  }
  if (selection.printingId) {
    return printings.some((printing) => printing.id === selection.printingId)
      ? { printingId: selection.printingId, rarity: null }
      : { printingId: null, rarity: null };
  }
  const rarity = selection.rarity?.trim() || null;
  return {
    printingId: null,
    rarity: rarity && printings.some((printing) => printing.rarity === rarity) ? rarity : null,
  };
}

export function sameSelection(a: PrintingSelection, b: PrintingSelection): boolean {
  return a.printingId === b.printingId && (a.rarity ?? null) === (b.rarity ?? null);
}
