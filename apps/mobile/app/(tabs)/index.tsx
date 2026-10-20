import { Redirect, useLocalSearchParams, usePathname } from 'expo-router';

import { mapLinkTarget } from '@/src/features/search/searchLinks';

/**
 * The old Map tab (`/`, `/?region=&subdivision=`): since stage R5 the map is Search's default view
 * (owner spec 2026-10-14, section 4), so the app's first screen and every old link to the map land
 * there, on the region and the state the link names. Hidden from the tab bar; stage R7 makes this
 * route Home. It redirects only while it is the screen on display: mounted under another screen
 * (the onboarding over the tabs), a redirect would take that screen away.
 */
export default function MapRedirect() {
  const params = useLocalSearchParams<{ region?: string; subdivision?: string }>();
  const pathname = usePathname();
  return pathname === '/' ? <Redirect href={mapLinkTarget(params)} /> : null;
}
