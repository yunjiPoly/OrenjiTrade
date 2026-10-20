import { useWindowDimensions } from 'react-native';

/**
 * From this system text size on, a list row that puts a second column beside its text (a price,
 * "Available", a switch) stacks it under the text instead. Beside it, at the largest
 * accessibility sizes, the text kept a third of the row and broke handles and names in the
 * middle of a word ("someon e", "leo_ uzm b").
 */
export const STACKED_ROW_FONT_SCALE = 1.3;

/** True while the rows of a list stack their columns (see `STACKED_ROW_FONT_SCALE`). */
export function useStackedRows(): boolean {
  return useWindowDimensions().fontScale > STACKED_ROW_FONT_SCALE;
}
