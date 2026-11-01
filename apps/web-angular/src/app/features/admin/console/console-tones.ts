/**
 * The light text tones of styles.scss (`--app-warning-text`, `--app-success-text`,
 * `--app-danger-text`, `--app-accent-text`; web WH1 review fix 1, finding A3): the console's chips,
 * counts and states as text. Dark keeps the tokens. Kept in step with styles.scss by
 * console-tones.spec.ts, which checks each one on the tint it sits on.
 */
export const CONSOLE_LIGHT_TEXT = {
  warning: '#92400E',
  success: '#166534',
  danger: '#B91C1C',
  accent: '#115E59',
} as const;
