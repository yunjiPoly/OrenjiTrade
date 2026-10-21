import { useLocalSearchParams } from 'expo-router';

import { BinderEditorScreen } from '@/src/features/binders/BinderEditor';

/**
 * New binder (spec 2026-10-14, section 7: Edit binder "also used for New binder"): private and a
 * plain binder at first; "Sell as a deck core" makes it a deck core. A reached `binders.max` is
 * explained in place, the same limit for every collector. Its game (stage G) starts on `?game=`
 * (a card's, when opened from a card's binder picker), else on the browsed game.
 */
export default function NewBinderScreen() {
  const { game } = useLocalSearchParams<{ game?: string }>();
  return <BinderEditorScreen id={null} game={typeof game === 'string' ? game : null} />;
}
