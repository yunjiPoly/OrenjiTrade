import { useLocalSearchParams } from 'expo-router';

import { BinderEditorScreen } from '@/src/features/binders/BinderEditor';

/**
 * Edit binder (`/binders/edit?id=`, spec 2026-10-14, section 7, screen 18): the name, who can see
 * it, "Sell as a deck core" with its photos, price and note, its cards, "Save changes" and "Delete
 * binder". Inventory › Binders opens it.
 */
export default function EditBinderScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <BinderEditorScreen id={id ?? ''} />;
}
