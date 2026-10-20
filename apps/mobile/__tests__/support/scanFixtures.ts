import type {
  CardScanCard,
  CardScanMatch,
  CardScanOtherMatch,
  CardScanPrinting,
  ScanRead,
} from '@/src/features/scan/types';

/**
 * Fictional cards and matcher answers for the scan's screen tests (twins of the mockup's sample
 * data: names, codes and ids are made up; no real card).
 */

export const YEW: CardScanCard = {
  id: 'card-yew',
  name: 'Yew Flowers & Velvet Breeze',
  imageUrl: '/api/v1/public/card-images/img-yew',
};
export const LYRA: CardScanCard = { id: 'card-lyra', name: 'Fable Tide - Lyra' };
export const LANTERN: CardScanCard = { id: 'card-lantern', name: 'Endless Lantern' };
export const FOX: CardScanCard = { id: 'card-fox', name: 'Moonlit Paper Fox' };

export function printing(
  id: string,
  printingCode: string,
  setName: string,
  rarity?: string
): CardScanPrinting {
  return {
    id,
    printingCode,
    setCode: printingCode.split('-')[0] ?? printingCode,
    setName,
    ...(rarity ? { rarity } : {}),
  };
}

export const ZACR_036 = printing('p-zacr-036', 'ZACR-EN036', 'Lantern Crisis', 'Secret Rare');
export const ZAGO_011 = printing('p-zago-011', 'ZAGO-EN011', 'Lantern Gold', 'Premium Gold Rare');
export const ZRA4_025_SUPER = printing(
  'p-zra4-025-s',
  'ZRA4-EN025',
  'Stampede of Lanterns',
  'Super Rare'
);
export const ZRA4_025_ULTRA = printing(
  'p-zra4-025-u',
  'ZRA4-EN025',
  'Stampede of Lanterns',
  'Ultra Rare'
);

export const ZRA1_075 = [
  printing('p-zra1-075-s', 'ZRA1-EN075', 'Lantern Rarity Collection', 'Super Rare'),
  printing('p-zra1-075-u', 'ZRA1-EN075', 'Lantern Rarity Collection', 'Ultra Rare'),
  printing('p-zra1-075-x', 'ZRA1-EN075', 'Lantern Rarity Collection', 'Secret Rare'),
];

export const FOX_PRINTINGS = [
  printing('p-zdup-077', 'ZDUP-EN077', 'Paper Power', 'Ultra Rare'),
  printing('p-zra5-091-u', 'ZRA5-EN091', 'Paper Rarity 5', 'Ultra Rare'),
  printing('p-zra5-091-x', 'ZRA5-EN091', 'Paper Rarity 5', 'Starlight Rare'),
  printing('p-zlob-005', 'ZLOB-EN005', 'Legend of Paper Foxes', 'Common'),
];

export const LYRA_OTHER: CardScanOtherMatch = {
  cardId: LYRA.id,
  name: LYRA.name,
  kind: 'CODE',
  printingCode: 'ZACR-EN038',
  setName: 'Lantern Crisis',
  printingId: 'p-zacr-038',
  rarity: 'Super Rare',
};

export const FOX_BY_NAME: CardScanOtherMatch = { cardId: FOX.id, name: FOX.name, kind: 'NAME' };

export const READ_YEW: ScanRead = { codes: ['ZACR-EN036'], names: [YEW.name] };
export const READ_LANTERN: ScanRead = { codes: ['ZRA1-EN075'], names: [LANTERN.name] };
export const READ_FOX: ScanRead = { codes: [], names: [FOX.name] };

export const FOUND_YEW: CardScanMatch = {
  status: 'FOUND',
  card: YEW,
  printing: ZACR_036,
  rarities: [],
  printings: [ZRA4_025_SUPER, ZRA4_025_ULTRA, ZAGO_011, ZACR_036],
  otherMatches: [LYRA_OTHER, FOX_BY_NAME],
  read: READ_YEW,
};

export const PICK_RARITY_LANTERN: CardScanMatch = {
  status: 'PICK_RARITY',
  card: LANTERN,
  rarities: ZRA1_075,
  printings: ZRA1_075,
  otherMatches: [],
  read: READ_LANTERN,
};

export const PICK_PRINTING_FOX: CardScanMatch = {
  status: 'PICK_PRINTING',
  card: FOX,
  rarities: [],
  printings: FOX_PRINTINGS,
  otherMatches: [],
  read: READ_FOX,
};

export function notFound(read: ScanRead): CardScanMatch {
  return {
    status: 'NOT_FOUND',
    reason: 'NO_MATCH',
    rarities: [],
    printings: [],
    otherMatches: [],
    read,
  };
}
