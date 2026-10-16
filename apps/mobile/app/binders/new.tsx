import { BinderEditorScreen } from '@/src/features/binders/BinderEditor';

/**
 * New binder (spec 2026-10-14, section 7: Edit binder "also used for New binder"): private and a
 * plain binder at first; "Sell as a deck core" makes it a deck core. A reached `binders.max` is
 * explained in place, the same limit for every collector.
 */
export default function NewBinderScreen() {
  return <BinderEditorScreen id={null} />;
}
