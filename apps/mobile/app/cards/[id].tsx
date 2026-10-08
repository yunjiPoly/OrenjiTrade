import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useCard } from '@/src/api/hooks/catalog';
import { useGames } from '@/src/api/hooks/profile';
import type { CardDetail, PrintingSummary } from '@/src/api/types';
import { Button } from '@/src/components/ui/Button';
import { CardDataCredit, CardImage } from '@/src/components/ui/CardImage';
import { EmptyState } from '@/src/components/ui/EmptyState';
import { ErrorState } from '@/src/components/ui/ErrorState';
import { SectionCard } from '@/src/components/ui/Layout';
import { Screen } from '@/src/components/ui/Screen';
import { Skeleton, SkeletonList } from '@/src/components/ui/Skeleton';
import { PrintingList } from '@/src/features/catalog/PrintingList';
import {
  editionLabel,
  finishLabel,
  formatMarketPrice,
  languageName,
  metadataEntries,
  printingCode,
  printingImageUrl,
} from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import { fontFamily, fontWeight, radius, spacing, textStyle, useTheme } from '@/src/theme';

/**
 * Card detail (web: `/cards/:id`, `?printing=` selects a printing): the picture with the
 * provider credit, game-specific attributes from the game schema, the selected printing with its
 * market price, every printing, "Add to inventory", "Who has this near me" (the holders list with
 * every filter; "Show on the map" is the alternative view, the Map tab filtered by the card) and
 * "Add to wishlist". Deep-link target: https://www.orenjitrade.com/cards/<id> and
 * orenjitrade://cards/<id>.
 */
export default function CardScreen() {
  const { id, printing } = useLocalSearchParams<{ id: string; printing?: string }>();
  const card = useCard(id);
  const notFound =
    !!card.error && (card.error.status === 404 || card.error.errorCode === 'VALIDATION_FAILED');

  let content;
  if (card.data) {
    content = <CardContent card={card.data} printingId={printing ?? null} />;
  } else if (notFound) {
    content = <CardNotFound />;
  } else if (card.error) {
    content = (
      <ErrorState
        testID="card-error"
        error={card.error}
        title="This card could not load"
        onRetry={() => void card.refetch()}
      />
    );
  } else {
    content = <CardSkeleton />;
  }

  return (
    <>
      <Stack.Screen options={{ title: card.data?.name ?? 'Card' }} />
      <Screen scroll safeBottom testID="screen-card">
        {content}
      </Screen>
    </>
  );
}

function CardNotFound() {
  const router = useRouter();
  return (
    <EmptyState
      testID="card-not-found"
      icon="cards-outline"
      title="Card not found"
      description="This card does not exist or is no longer in the catalog."
      actionLabel="Search the catalog"
      onAction={() => router.navigate('/search')}
    />
  );
}

function CardSkeleton() {
  return (
    <View testID="card-loading" accessibilityLabel="Loading card" aria-busy style={styles.root}>
      <View style={styles.hero}>
        <Skeleton width={240} height={336} radius={radius.sm} />
      </View>
      <Skeleton width="40%" height={14} />
      <Skeleton width="75%" height={28} />
      <SkeletonList rows={3} rowHeight={56} />
    </View>
  );
}

function CardContent({ card, printingId }: { card: CardDetail; printingId: string | null }) {
  const { palette } = useTheme();
  const router = useRouter();
  const games = useGames();
  const printings = card.printings ?? [];
  const selected: PrintingSummary | null =
    printings.find((candidate) => candidate.id === printingId) ?? printings[0] ?? null;
  const schema = games.data?.find((game) => game.slug === card.game)?.schema ?? null;
  const name = card.name ?? 'Card';
  const code = selected ? printingCode(selected) : '';
  const hero = printingImageUrl(selected) ?? card.primaryImageUrl ?? null;
  const typeLine = [card.cardType, card.subtype].filter(Boolean).join(' · ');
  const attributes = metadataEntries(schema?.metadataFields, card.metadata);
  const price = formatMarketPrice(selected?.marketPrice);

  const select = (printing: PrintingSummary) => {
    if (printing.id) {
      router.setParams({ printing: printing.id });
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <CardImage
          src={hero}
          alt={`${name}${code ? `, printing ${code}` : ''}`}
          game={card.game}
          size="lg"
          testID="card-hero-image"
        />
        {selected ? (
          <Text style={[textStyle('sm'), styles.caption, { color: palette.textMuted }]}>
            <Text style={styles.mono}>{code}</Text>
            {selected.setName ? ` · ${selected.setName}` : ''}
          </Text>
        ) : null}
        <CardDataCredit game={card.game} />
      </View>

      <View style={styles.titleBlock}>
        {card.game ? (
          <Text style={[textStyle('xs'), styles.eyebrow, { color: palette.primary }]}>
            {gameLabel(card.game)}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          testID="card-name"
          style={[textStyle('2xl', 'heading'), styles.name, { color: palette.ink }]}
        >
          {name}
        </Text>
        {typeLine ? (
          <Text style={[textStyle('md'), { color: palette.textMuted }]}>{typeLine}</Text>
        ) : null}
        {card.text ? (
          <Text
            testID="card-text"
            style={[
              textStyle('md'),
              styles.text,
              { color: palette.ink, borderLeftColor: palette.borderStrong },
            ]}
          >
            {card.text}
          </Text>
        ) : null}
      </View>

      <View style={styles.ctas}>
        <Button
          label="Add to inventory"
          icon="plus-box-multiple-outline"
          onPress={() =>
            router.push({
              pathname: '/items/new',
              params: { cardId: card.id ?? '', printingId: selected?.id ?? '' },
            })
          }
          testID="card-add-to-inventory"
        />
        <Button
          label="Who has this near me"
          icon="account-search-outline"
          variant="secondary"
          accessibilityHint="Lists the collectors nearby who own, trade or sell this card"
          onPress={() => router.push({ pathname: '/holders', params: { card: card.id ?? '' } })}
          testID="card-holders"
        />
        <Button
          label="Show on the map"
          icon="map-marker-radius-outline"
          variant="secondary"
          accessibilityHint="Opens the map filtered by this card"
          onPress={() => router.navigate({ pathname: '/', params: { card: card.id ?? '' } })}
          testID="card-who-has-it"
        />
        <Button
          label="Add to wishlist"
          icon="heart-plus-outline"
          variant="secondary"
          accessibilityHint="We tell you when a collector nearby lists it"
          onPress={() =>
            router.push({
              pathname: '/wishlist/new',
              // The printing picked in the link (`?printing=`), else any printing (like the web).
              params: { cardId: card.id ?? '', printingId: printingId ?? '' },
            })
          }
          testID="card-add-to-wishlist"
        />
      </View>

      {selected ? (
        <SectionCard title="Selected printing" testID="card-selected-printing">
          <Text
            accessibilityRole="link"
            onPress={() =>
              selected.setId
                ? router.push({ pathname: '/sets/[id]', params: { id: selected.setId } })
                : router.navigate({
                    pathname: '/search',
                    params: {
                      game: card.game ?? '',
                      set: selected.setCode ?? '',
                      q: '',
                      tab: 'cards',
                    },
                  })
            }
            style={[textStyle('md'), styles.setLink, { color: palette.accent }]}
            testID="card-set-link"
          >
            {selected.setName} ({selected.setCode})
          </Text>
          <View style={styles.facts} accessibilityLabel="Printing details">
            <Fact label={code} mono />
            {selected.rarity ? <Fact label={selected.rarity} /> : null}
            <Fact label={editionLabel(selected.edition)} />
            <Fact label={languageName(selected.language)} />
            <Fact label={finishLabel(selected.finish)} />
          </View>
          <View testID="card-price">
            {price ? (
              <>
                <Text style={[textStyle('xl', 'heading'), styles.name, { color: palette.ink }]}>
                  {price}
                </Text>
                <Text style={[textStyle('xs'), { color: palette.textMuted }]}>
                  Market price
                  {selected.marketPrice?.updatedAt
                    ? ` · ${selected.marketPrice.updatedAt.slice(0, 10)}`
                    : ''}
                </Text>
              </>
            ) : (
              <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
                No market price for this printing yet.
              </Text>
            )}
          </View>
        </SectionCard>
      ) : null}

      <SectionCard title="Attributes" testID="card-attributes">
        {attributes.length === 0 ? (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            No attributes recorded for this card.
          </Text>
        ) : (
          attributes.map((entry) => (
            <View key={entry.key} style={styles.attribute}>
              <Text style={[textStyle('sm'), styles.attributeLabel, { color: palette.textMuted }]}>
                {entry.label}
              </Text>
              <Text style={[textStyle('sm'), styles.attributeValue, { color: palette.ink }]}>
                {entry.value}
              </Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title={`Printings (${printings.length})`} testID="card-printings">
        {printings.length > 0 ? (
          <PrintingList
            printings={printings}
            cardName={name}
            game={card.game}
            selectedId={selected?.id ?? null}
            onSelect={select}
            label={`Printings of ${name}`}
            showPrice
          />
        ) : (
          <Text style={[textStyle('sm'), { color: palette.textMuted }]}>
            No printings are recorded for this card yet.
          </Text>
        )}
      </SectionCard>
    </View>
  );
}

function Fact({ label, mono = false }: { label: string; mono?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={[styles.fact, { backgroundColor: palette.surfaceVariant }]}>
      <Text style={[textStyle('sm'), mono && styles.mono, { color: palette.ink }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  hero: { alignItems: 'center', gap: spacing[2] },
  caption: { textAlign: 'center' },
  mono: { fontFamily: fontFamily.mono },
  titleBlock: { gap: spacing[1] },
  eyebrow: { fontWeight: fontWeight.semibold, textTransform: 'uppercase', letterSpacing: 0.6 },
  name: { fontWeight: fontWeight.bold },
  text: { marginTop: spacing[2], paddingLeft: spacing[3], borderLeftWidth: 3 },
  ctas: { gap: spacing[2] },
  setLink: { fontWeight: fontWeight.semibold, textDecorationLine: 'underline' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  fact: { borderRadius: radius.pill, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  attribute: { flexDirection: 'row', gap: spacing[3] },
  attributeLabel: { flex: 2 },
  attributeValue: { flex: 3, fontWeight: fontWeight.medium },
});
