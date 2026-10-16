import { Redirect, useLocalSearchParams } from 'expo-router';

import { mapLinkTarget } from '@/src/features/search/searchLinks';

/**
 * The old Map tab (`/`, `/?region=&subdivision=`): since stage R5 the map is Search's default view
 * (owner spec 2026-10-14, section 4), so the app's first screen and every old link to the map land
 * there, on the region and the state the link names. Hidden from the tab bar; stage R7 makes this
 * route Home.
 */
export default function MapRedirect() {
  const params = useLocalSearchParams<{ region?: string; subdivision?: string }>();
  return <Redirect href={mapLinkTarget(params)} />;
}
