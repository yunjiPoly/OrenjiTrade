import { StyleSheet, View } from 'react-native';

import type { PrintingSummary } from '@/src/api/types';
import { CardImage } from '@/src/components/ui/CardImage';
import { Text } from '@/src/components/ui/Text';
import { printingCode, printingImageUrl } from '@/src/lib/catalog';
import { gameLabel } from '@/src/lib/profile';
import { fontFamily, fontWeight, TITLE_MAX_FONT_SCALE, useTheme } from '@/src/theme';

export interface CardHeaderProps {
  name: string;
  game: string | null | undefined;
  printing: PrintingSummary | null | undefined;
  /** A picture when the printing has none (the card's). */
  fallbackImage?: string | null;
  /** `add`: Add to inventory ("{code} · {set}"); `edit`: Edit card (larger, the code only). */
  variant: 'add' | 'edit';
}

/**
 * The card at the top of Add to inventory and Edit card (mockup v32, screens 6 and 7): the
 * picture, the game in capitals, the name and the card code in mono.
 */
export function CardHeader({ name, game, printing, fallbackImage, variant }: CardHeaderProps) {
  const { palette } = useTheme();
  const edit = variant === 'edit';
  const code = printing ? printingCode(printing) : '';
  const line = edit || !printing?.setName ? code : `${code} · ${printing.setName}`;
  return (
    <View style={styles.row} testID="card-header">
      <CardImage
        src={printingImageUrl(printing ?? null) ?? fallbackImage ?? null}
        alt=""
        game={game}
        size="xs"
        style={[edit ? styles.large : styles.small, { borderColor: palette.borderStrong }]}
      />
      <View style={styles.text}>
        {game ? (
          <Text style={[styles.game, { color: palette.textMuted }]}>
            {gameLabel(game).toUpperCase()}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={TITLE_MAX_FONT_SCALE}
          testID="card-header-name"
          style={[edit ? styles.editName : styles.addName, { color: palette.ink }]}
        >
          {name}
        </Text>
        {line ? (
          <Text style={[styles.code, { color: palette.textMuted }]} testID="card-header-code">
            {line}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  small: { width: 50, height: 72, borderRadius: 6, borderWidth: 1 },
  large: { width: 64, height: 92, borderRadius: 7, borderWidth: 1 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  game: { fontSize: 11, lineHeight: 14, fontWeight: fontWeight.semibold, letterSpacing: 0.6 },
  addName: { fontSize: 17, lineHeight: 22, fontWeight: fontWeight.bold },
  editName: {
    fontFamily: fontFamily.display,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  code: { fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 },
});
