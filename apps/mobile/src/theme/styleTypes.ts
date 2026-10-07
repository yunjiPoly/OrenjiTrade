import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

/**
 * View style types the app's components take and compute.
 *
 * Since React Native 0.87 (Expo SDK 58) `<View style>` is typed with React Native's generated
 * "strict" view style, while `<Pressable>`, `<Text>` and many libraries still take the exported
 * `ViewStyle` / `TextStyle` interfaces, which Expo's web typings
 * (`expo/types/react-native-web.d.ts`, referenced by expo-env.d.ts) widen with web-only values
 * (`position: 'fixed' | 'sticky'`, `backgroundImage: string`, `cursor: string`). Neither is
 * assignable to the other any more, so a `StyleProp<ViewStyle>` prop no longer reaches a `<View>`.
 * The intersection of both is accepted everywhere.
 */
export type ViewStyleObject = Exclude<
  ViewProps['style'],
  null | void | false | '' | readonly unknown[]
> &
  ViewStyle;

/** The `style` prop of a component that passes it on to a `<View>` or a `<Pressable>`. */
export type ViewStyleProp = StyleProp<ViewStyleObject>;
