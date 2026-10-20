import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, StyleSheet, View } from 'react-native';

import type { CardSuggestion } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { afterModals } from '@/src/components/ui/modalTurns';
import { useSnackbar } from '@/src/components/ui/Snackbar';
import { AddCardSearch } from '@/src/features/inventory/AddCardSearch';
import { InventoryFormScreen } from '@/src/features/inventory/InventoryFormScreen';

import { PrintingListSheet } from './PrintingListSheet';
import { RarityListSheet } from './RarityListSheet';
import { REVIEW_COPY, tileAnnouncement } from './scanCopy';
import { SCAN_CAMERA_ROUTE } from './scanRoutes';
import {
  findTile,
  pickPrinting,
  pickRarity,
  replaceMatch,
  type PrintingRow,
  type ScanTile,
} from './scanSession';
import { scanCardOf, scanPrintingOf, searchTextOf } from './scanSearch';
import { useScanStore } from './scanStore';
import { SCAN_GAME, type CardScanCard, type CardScanPrinting } from './types';

/**
 * Search by name or code, inside the scan (owner spec 2026-10-15, section 4; opened by 28's "Not
 * here? Search", 29's "Search by name or code", a review row and the printing list): R2's "Add
 * cards, typing" screen (its screen 4), opened with what was read, with Yu-Gi-Oh! cards only and
 * its own hint. An exact printing fixes the tile at once; a card opens the printing list (and the
 * rarity list next for a code in several rarities). The tile changes only once the printing is
 * known, or when the rarity list is cancelled (the tile then asks for the rarity of that card);
 * the rarity list's "Search by name or code" leaves the tile as it was. Every pick goes back to
 * where the search was opened: the scan and its tray are kept. An exact printing in another
 * language than English says that the scan adds English cards only.
 */
export function ScanSearchScreen() {
  const router = useRouter();
  const { tileId = '' } = useLocalSearchParams<{ tileId?: string }>();
  const tile = useScanStore((state) => findTile(state.session, tileId));
  const apply = useScanStore((state) => state.apply);
  const snackbar = useSnackbar();
  const [text, setText] = useState(() => searchTextOf(tile?.read ?? null));
  const [candidate, setCandidate] = useState<CardScanCard | null>(null);
  // A code of the card picked that comes in several rarities: kept here until one is picked.
  const [rarityCandidate, setRarityCandidate] = useState<{
    card: CardScanCard;
    printings: CardScanPrinting[];
    row: PrintingRow;
  } | null>(null);
  const leaving = useRef(false);

  const back = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(SCAN_CAMERA_ROUTE);
    }
  }, [router]);

  /** The tile is fixed: its result is said, and the search goes back once its sheets are gone. */
  const finish = useCallback(async () => {
    if (leaving.current) {
      return;
    }
    leaving.current = true;
    const fixed = findTile(useScanStore.getState().session, tileId);
    if (fixed) {
      AccessibilityInfo.announceForAccessibility(tileAnnouncement(fixed));
    }
    await afterModals();
    back();
  }, [back, tileId]);

  if (!tile) {
    return (
      <InventoryFormScreen header={null} testID="screen-scan-search">
        <View style={styles.gone}>
          <EmptyState
            icon="cards-outline"
            title={REVIEW_COPY.tileGone}
            actionLabel={REVIEW_COPY.backToScanning}
            onAction={back}
            testID="scan-search-gone"
          />
        </View>
      </InventoryFormScreen>
    );
  }

  const pickExact = (suggestion: CardSuggestion) => {
    const card = scanCardOf(suggestion);
    const printing = scanPrintingOf(suggestion);
    if (card && !printing && suggestion.printingId) {
      // A printing in another language (the search lists every printing of the code). The
      // keyboard steps aside so the notice can be read whole, at every text size.
      Keyboard.dismiss();
      snackbar.show(REVIEW_COPY.englishOnly);
      return;
    }
    if (!card || !printing) {
      return;
    }
    apply((current) => replaceMatch(current, tileId, { card, printing }));
    void finish();
  };

  const pickCard = (suggestion: CardSuggestion) => {
    const card = scanCardOf(suggestion);
    if (card) {
      setCandidate(card);
    }
  };

  // The printing list for the card picked: the tile is changed only once a printing is picked.
  const listed: ScanTile | null = candidate
    ? {
        ...tile,
        status: 'PICK_PRINTING',
        card: candidate,
        printing: null,
        rarities: [],
        printings: candidate.id === tile.card?.id ? tile.printings : [],
        otherMatches: [],
      }
    : null;

  /** The card picked with the code picked, on the tile (a code in several rarities: Pick rarity). */
  const applyPick = (card: CardScanCard, printings: CardScanPrinting[], row: PrintingRow) =>
    apply((current) =>
      pickPrinting(replaceMatch(current, tileId, { card, printings }), tileId, row)
    );

  const pickRow = (row: PrintingRow, printings: readonly CardScanPrinting[]) => {
    if (!candidate) {
      return;
    }
    const card = candidate;
    setCandidate(null);
    if (row.printings.length > 1) {
      // Its rarity next: the tile stays as it was until one is picked.
      setRarityCandidate({ card, printings: [...printings], row });
      return;
    }
    applyPick(card, [...printings], row);
    void finish();
  };

  // The rarity list for the code picked: the tile as it would be, not changed yet.
  const rarityListed: ScanTile | null = rarityCandidate
    ? {
        ...tile,
        status: 'PICK_RARITY',
        card: rarityCandidate.card,
        printing: null,
        rarities: rarityCandidate.row.printings,
        printings: rarityCandidate.printings,
        otherMatches: [],
      }
    : null;

  return (
    <>
      <InventoryFormScreen header={null} testID="screen-scan-search">
        <AddCardSearch
          text={text}
          onText={setText}
          onCancel={back}
          onCard={pickCard}
          onPrinting={pickExact}
          game={SCAN_GAME}
          hint={REVIEW_COPY.searchHint}
        />
      </InventoryFormScreen>
      <PrintingListSheet
        tile={listed}
        onPick={pickRow}
        // "search by name or code" when no printing has the code typed: this search.
        onSearch={() => setCandidate(null)}
        onClose={() => setCandidate(null)}
      />
      <RarityListSheet
        tile={rarityListed}
        onPick={(printingId) => {
          if (rarityCandidate) {
            const { card, printings, row } = rarityCandidate;
            applyPick(card, printings, row);
            apply((current) => pickRarity(current, tileId, printingId));
          }
          setRarityCandidate(null);
          void finish();
        }}
        // "Search by name or code": not this card after all, back to this search (tile unchanged).
        onSearch={() => setRarityCandidate(null)}
        onClose={() => {
          // The card and its code are picked: the tile asks for its rarity where it was opened.
          if (rarityCandidate) {
            const { card, printings, row } = rarityCandidate;
            applyPick(card, printings, row);
          }
          setRarityCandidate(null);
          void finish();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gone: { flexGrow: 1, justifyContent: 'center' },
});
