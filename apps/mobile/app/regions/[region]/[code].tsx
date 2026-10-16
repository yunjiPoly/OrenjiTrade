import { useLocalSearchParams } from 'expo-router';

import { placeBindersTarget } from '@/src/features/search/searchLinks';
import { DeferredRedirect } from '@/src/navigation/DeferredRedirect';

/**
 * The old public binders of a state or province (`/regions/<region>/<code>`, stage M9): since
 * stage R5 they are Search › Binders filtered to that state (owner spec 2026-10-14, sections 4 and
 * 8), on the region the link names.
 */
export default function PlaceBindersRedirect() {
  const params = useLocalSearchParams<{ region?: string; code?: string }>();
  return <DeferredRedirect href={placeBindersTarget(params)} testID="screen-place" />;
}
