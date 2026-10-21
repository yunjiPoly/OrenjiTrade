import { Redirect, useLocalSearchParams, usePathname } from 'expo-router';

import { HomeScreen } from '@/src/features/home/HomeScreen';
import { mapLinkTarget } from '@/src/features/search/searchLinks';

/**
 * Home, the first of five tabs (stage R7; owner prompt of 2026-10-19). `/` is Home; the old Map
 * tab's links (`/?region=&subdivision=`, before stage R5) still open Search's map on the region and
 * the state they name. The redirect happens only while this route is the screen on display: mounted
 * under another screen (the onboarding over the tabs), it would take that screen away.
 */
export default function HomeRoute() {
  const params = useLocalSearchParams<{ region?: string; subdivision?: string }>();
  const pathname = usePathname();
  const oldMapLink = params.region !== undefined || params.subdivision !== undefined;
  if (oldMapLink) {
    return pathname === '/' ? <Redirect href={mapLinkTarget(params)} /> : null;
  }
  return <HomeScreen />;
}
