import { useInventorySummary } from '@/src/api/hooks/inventory';
import { RadioSheet } from '@/src/components/ui/RadioSheet';

import { useBrowsingGame } from './browsingGame';
import { GAME_COPY } from './gameCopy';
import { GameTile } from './GameTile';

export interface GameSheetProps {
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

/**
 * "Choose a game" (stage G, mockup screen 34): one row per game in the games' order with its 38 pt
 * tile, its name and "{n} of your cards" (or "None of your cards yet"), a radio; a game whose
 * catalogue holds no card yet is dimmed with "Cards coming soon" and cannot be picked. Picking a
 * game closes the sheet and Home and Search show that game; nothing else to confirm. The footnote
 * says what stays on every game.
 */
export function GameSheet({ visible, onClose, testID = 'game-sheet' }: GameSheetProps) {
  const { game, options, select } = useBrowsingGame();
  const byGame = useInventorySummary().data?.byGame ?? {};
  return (
    <RadioSheet
      visible={visible}
      onClose={onClose}
      title={GAME_COPY.sheetTitle}
      description={GAME_COPY.sheetIntro}
      groupLabel={GAME_COPY.groupLabel}
      footnote={GAME_COPY.footnote}
      value={game}
      onPick={select}
      testID={testID}
      options={options.map((option) => ({
        value: option.slug,
        label: option.name,
        detail: option.browsable
          ? GAME_COPY.yourCards(Number(byGame[option.slug] ?? 0))
          : GAME_COPY.comingSoon,
        disabled: !option.browsable,
        leading: <GameTile slug={option.slug} name={option.name} size={38} />,
      }))}
    />
  );
}
