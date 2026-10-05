/**
 * Native-stack header options for the top inset on Android.
 *
 * react-native-screens' native header pads itself with the status-bar height, measured on the
 * decor view. When the app's window already starts below the status bar (Expo Go on Android: the
 * safe-area top inset is 0, which is also what the tab headers use), that padding is a second
 * inset: a blank band the height of the status bar above every stack header (settings, legal,
 * onboarding, collector pages). The header then skips it. In an edge-to-edge build the window
 * draws under the status bar (top inset > 0) and the header keeps applying it.
 */
export function nativeHeaderInsetOptions(
  platform: string,
  safeAreaTop: number
): { unstable_nativeProps?: { headerConfig: { disableTopInsetApplication: boolean } } } {
  return platform === 'android' && safeAreaTop === 0
    ? { unstable_nativeProps: { headerConfig: { disableTopInsetApplication: true } } }
    : {};
}
