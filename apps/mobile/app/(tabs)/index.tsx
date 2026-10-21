import { Redirect, useLocalSearchParams, useNavigation, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

import { HomeScreen } from '@/src/features/home/HomeScreen';
import { mapLinkTarget } from '@/src/features/search/searchLinks';

type OldMapLinkParams = { region?: string; subdivision?: string };

/**
 * Home, the first of five tabs (stage R7; owner prompt of 2026-10-19). `/` is Home; the old Map
 * tab's links (`/?region=&subdivision=`, before stage R5) still open Search's map on the region and
 * the state they name. The redirect happens only while this route is the screen on display: mounted
 * under another screen (the onboarding over the tabs), it would take that screen away.
 *
 * A link is followed once: once the redirect has left this route, its parameters are cleared, as
 * Search does with its own. Kept, they sent every later tap on the Home tab back to Search until
 * the app restarted (R7 review U1/F1). A link not followed yet (under the onboarding) is kept.
 */
export default function HomeRoute() {
  const params = useLocalSearchParams<OldMapLinkParams>();
  const pathname = usePathname();
  const navigation = useNavigation<{ setParams: (params: Partial<OldMapLinkParams>) => void }>();
  const oldMapLink = params.region !== undefined || params.subdivision !== undefined;
  const following = oldMapLink && pathname === '/';
  const redirected = useRef(false);
  useEffect(() => {
    if (following) {
      redirected.current = true;
    } else if (oldMapLink && redirected.current) {
      redirected.current = false;
      navigation.setParams({ region: undefined, subdivision: undefined });
    }
  }, [following, navigation, oldMapLink]);
  if (oldMapLink) {
    return following ? <Redirect href={mapLinkTarget(params)} /> : null;
  }
  return <HomeScreen />;
}
