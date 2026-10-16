import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import type { CardSuggestion } from '@/src/api/types';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { afterModals } from '@/src/components/ui/modalTurns';
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
 * rarity list next for a code in several rarities). Every pick goes back to where the search was
 * opened: the scan and its tray are kept.
 */
export function ScanSearchScreen() {
  const router = useRouter();
  const { tileId = '' } = useLocalSearchParams<{ tileId?: string }>();
  const tile = useScanStore((state) => findTile(state.session, tileId));
  const apply = useScanStore((state) => state.apply);
  const [text, setText] = useState(() => searchTextOf(tile?.read ?? null));
  const [candidate, setCandidate] = useState<CardScanCard | null>(null);
  const [rarityOpen, setRarityOpen] = useState(false);
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

  const pickRow = (row: PrintingRow, printings: readonly CardScanPrinting[]) => {
    if (!candidate) {
      return;
    }
    const card = candidate;
    apply((current) =>
      pickPrinting(replaceMatch(current, tileId, { card, printings: [...printings] }), tileId, row)
    );
    setCandidate(null);
    if (findTile(useScanStore.getState().session, tileId)?.status === 'PICK_RARITY') {
      setRarityOpen(true);
    } else {
      void finish();
    }
  };

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
        tile={rarityOpen ? tile : null}
        onPick={(printingId) => {
          apply((current) => pickRarity(current, tileId, printingId));
          setRarityOpen(false);
          void finish();
        }}
        // "Search by name or code": not this card after all, back to this search.
        onSearch={() => setRarityOpen(false)}
        onClose={() => {
          // The card and its code are picked: the tile asks for its rarity where it was opened.
          setRarityOpen(false);
          void finish();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gone: { flexGrow: 1, justifyContent: 'center' },
});
