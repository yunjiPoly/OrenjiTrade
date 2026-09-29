/** Card condition vocabulary (games may narrow it through their GameSchema). */
export type CardCondition =
  | 'MINT'
  | 'NEAR_MINT'
  | 'LIGHTLY_PLAYED'
  | 'MODERATELY_PLAYED'
  | 'HEAVILY_PLAYED'
  | 'DAMAGED';

export interface CardConditionInfo {
  abbreviation: string;
  label: string;
}

export const CARD_CONDITIONS: Record<CardCondition, CardConditionInfo> = {
  MINT: { abbreviation: 'M', label: 'Mint' },
  NEAR_MINT: { abbreviation: 'NM', label: 'Near Mint' },
  LIGHTLY_PLAYED: { abbreviation: 'LP', label: 'Lightly Played' },
  MODERATELY_PLAYED: { abbreviation: 'MP', label: 'Moderately Played' },
  HEAVILY_PLAYED: { abbreviation: 'HP', label: 'Heavily Played' },
  DAMAGED: { abbreviation: 'DMG', label: 'Damaged' },
};

export const CARD_CONDITION_ORDER: readonly CardCondition[] = [
  'MINT',
  'NEAR_MINT',
  'LIGHTLY_PLAYED',
  'MODERATELY_PLAYED',
  'HEAVILY_PLAYED',
  'DAMAGED',
];
