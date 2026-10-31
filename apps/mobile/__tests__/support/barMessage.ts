import { screen, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';

import { BAR_MESSAGE_MAX_SHARE } from '@/src/features/settings/SettingsPage';
import { PINNED_MAX_FONT_SCALE } from '@/src/theme';

/**
 * A refusal said in the bar at the bottom of a page (`BarMessage`): its words follow the text size
 * as little as the button beside it, and it scrolls within a quarter of the window. Unbounded, at
 * the largest text sizes it covered the form and the bar's own buttons (R14 review fix 1, U1).
 */
export function expectBoundedBarMessage(testID: string, text: string | RegExp) {
  const scroll = screen.getByTestId(`${testID}-scroll`);
  expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBe(
    Math.round(Dimensions.get('window').height * BAR_MESSAGE_MAX_SHARE)
  );
  const message = within(scroll).getByTestId(testID);
  expect(within(message).getByText(text).props.maxFontSizeMultiplier).toBe(PINNED_MAX_FONT_SCALE);
}
