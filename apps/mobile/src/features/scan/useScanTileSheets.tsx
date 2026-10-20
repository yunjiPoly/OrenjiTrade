import { useCallback, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { CheckMatchSheet } from './CheckMatchSheet';
import { PrintingListSheet } from './PrintingListSheet';
import { RarityListSheet } from './RarityListSheet';
import { tileAction, tileAnnouncement } from './scanCopy';
import type { MatchRailItem } from './scanPrintings';
import { scanRunner } from './scanRunner';
import {
  chooseOtherMatch,
  findTile,
  pickPrinting,
  pickRarity,
  replaceMatch,
  setCopies,
  type PrintingRow,
  type ScanTile,
} from './scanSession';
import { useScanStore } from './scanStore';
import type { CardScanPrinting } from './types';
import { UnreadSheet } from './UnreadSheet';

/** The sheet a tile opens: 28, the rarity list, the printing list, or 29. */
export type TileSheet = 'DETAILS' | 'RARITY_LIST' | 'PRINTING_LIST' | 'UNREAD';

export interface ScanTileSheetsOptions {
  /** "Search by name or code" for a tile (29, 28's "Not here? Search", the two lists). */
  onSearch: (tileId: string) => void;
  /** After "Take it again" removed the tile: back to the camera (nothing to do on the camera). */
  onTakeAgain?: () => void;
}

/**
 * The quick fixes of a tile, opened in place over the camera (27) or the review (30), owner spec
 * 2026-10-15, section 4: a found card opens 28 (Check the match), "Pick rarity" the rarity list,
 * "Pick printing" the printing list (a code in several rarities opens the rarity list next), and
 * "Couldn't read" 29; a tile waiting for the connection is matched again. Every pick changes the
 * scan at once (`scanStore`), and the screen reader says the card's new result ("Ash Blossom &
 * Joyous Spring, found"), as the search inside the scan does.
 */
export function useScanTileSheets({ onSearch, onTakeAgain }: ScanTileSheetsOptions) {
  const [open, setOpen] = useState<{ sheet: TileSheet; tileId: string } | null>(null);
  const session = useScanStore((state) => state.session);
  const apply = useScanStore((state) => state.apply);
  const tile = open ? findTile(session, open.tileId) : null;
  const tileId = open?.tileId ?? '';

  const openTile = useCallback((target: ScanTile) => {
    const action = tileAction(target);
    if (action === 'RETRY') {
      // Asked by the collector: the result is said even when the card still waits.
      void scanRunner.retryWaiting({ explicit: true });
    } else if (action) {
      setOpen({ sheet: action, tileId: target.id });
    }
  }, []);
  const close = useCallback(() => setOpen(null), []);

  /** After a change: the sheet the tile now needs, if its status asks for another one. */
  const follow = (stay: TileSheet) => {
    const next = findTile(useScanStore.getState().session, tileId);
    if (!next) {
      setOpen(null);
    } else if (next.status === 'PICK_PRINTING') {
      setOpen({ sheet: 'PRINTING_LIST', tileId });
    } else if (next.status === 'PICK_RARITY' && stay !== 'DETAILS') {
      setOpen({ sheet: 'RARITY_LIST', tileId });
    } else if (next.status === 'FOUND' && stay !== 'DETAILS') {
      setOpen(null);
    }
  };

  /** The tile's new result, said by the screen reader. */
  const announce = () => {
    const next = findTile(useScanStore.getState().session, tileId);
    if (next) {
      AccessibilityInfo.announceForAccessibility(tileAnnouncement(next));
    }
  };

  const search = () => {
    setOpen(null);
    onSearch(tileId);
  };

  const remove = () => {
    // Its photo files are deleted once the sheet has slid away.
    scanRunner.removeTile(tileId);
    setOpen(null);
  };

  const sheetTile = (sheet: TileSheet) => (open?.sheet === sheet ? tile : null);

  const sheets = (
    <>
      <CheckMatchSheet
        tile={sheetTile('DETAILS')}
        onRemove={remove}
        onClose={close}
        onCopies={(copies) => apply((current) => setCopies(current, tileId, copies))}
        onRarity={(printingId) => {
          apply((current) => pickRarity(current, tileId, printingId));
          announce();
        }}
        onChoose={(item: MatchRailItem) => {
          if (item.choice.kind === 'ROW') {
            const { row } = item.choice;
            apply((current) => pickPrinting(current, tileId, row));
          } else if (item.choice.kind === 'OTHER') {
            const { other } = item.choice;
            apply((current) => chooseOtherMatch(current, tileId, other));
          }
          announce();
          follow('DETAILS');
        }}
        onSearch={search}
      />
      <RarityListSheet
        tile={sheetTile('RARITY_LIST')}
        onPick={(printingId) => {
          apply((current) => pickRarity(current, tileId, printingId));
          announce();
          setOpen(null);
        }}
        onSearch={search}
        onClose={close}
      />
      <PrintingListSheet
        tile={sheetTile('PRINTING_LIST')}
        onPick={(row: PrintingRow, printings: readonly CardScanPrinting[]) => {
          apply((current) => {
            const known = findTile(current, tileId);
            // A card picked by hand keeps the printings the list loaded for it.
            const withPrintings =
              known?.card && known.printings.length === 0
                ? replaceMatch(current, tileId, { card: known.card, printings: [...printings] })
                : current;
            return pickPrinting(withPrintings, tileId, row);
          });
          announce();
          follow('PRINTING_LIST');
        }}
        onSearch={search}
        onClose={close}
      />
      <UnreadSheet
        tile={sheetTile('UNREAD')}
        onRemove={remove}
        onClose={close}
        onSearch={search}
        onTakeAgain={() => {
          remove();
          onTakeAgain?.();
        }}
      />
    </>
  );

  return { openTile, close, open, sheets };
}
