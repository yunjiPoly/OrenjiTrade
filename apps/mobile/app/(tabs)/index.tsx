import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/src/account/AccountProvider';
import { useHomeRegion } from '@/src/api/hooks/regions';
import { Button } from '@/src/components/ui/Button';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ScreenHeader, SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { regionName } from '@/src/lib/place';
import { spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Map tab (ADR 0017). The web shows a map of the region's states and provinces shaded by public
 * binders; the app does not draw it yet (follow-up: the same bundled boundaries in the app), so
 * the tab explains that and leads to region-scoped search. No collector position exists anywhere:
 * there is nothing to pin. `react-native-maps` stays installed so the native build is unchanged.
 */
export default function MapScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const account = useAccount();
  const region = useHomeRegion();
  const signedIn = !!account.me;
  const withoutLocation = signedIn && account.me?.onboarding.locationSet === false;

  return (
    <Screen scroll testID="screen-map">
      <ScreenHeader
        eyebrow={regionName(region)}
        title="Map"
        subtitle="Binders by state and province"
      />
      <EmptyState
        icon="map-outline"
        title="The region map is coming to the app"
        description={`On the web, the map of ${regionName(region)} shows how many public binders each state or province holds, and opens their binders. Until it reaches the app, search cards, collectors and binders of your region.`}
        actionLabel="Search your region"
        onAction={() => router.push('/search')}
        testID="map-placeholder"
      />
      {withoutLocation ? (
        <SectionCard
          title="Where are you?"
          description="Say which state or province you are in, and collectors of your region can find your public binders."
        >
          <Button
            label="Choose my location"
            icon="map-marker-outline"
            onPress={() => router.push('/settings/location')}
            testID="map-choose-location"
          />
        </SectionCard>
      ) : null}
      <View style={styles.note}>
        <Text style={[textStyle('sm'), { color: palette.textMuted }]} testID="map-privacy-note">
          OrenjiTrade never uses your GPS: collectors choose their state or province, and that is
          all anyone sees.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: spacing[4] },
});
