import type { ReactNode } from 'react';
import { Text } from 'react-native';

/**
 * A light `expo-router` stand-in for screen tests (navigation itself is covered by the web E2E
 * suite and the Maestro flows). Use in a test file with:
 *
 *   jest.mock('expo-router', () => require('../support/router').expoRouterMock());
 *
 * then assert on `mockRouter.push` / `replace` / `dismissTo` / `back`.
 */
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
  dismissTo: jest.fn(),
  dismissAll: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  canDismiss: jest.fn(() => false),
  setParams: jest.fn(),
};

/** Route params returned by `useLocalSearchParams()`. */
export const mockParams: { current: Record<string, string> } = { current: {} };
/** Segments returned by `useSegments()`. */
export const mockSegments: { current: string[] } = { current: ['(tabs)'] };
/** Path returned by `usePathname()` (derived from the segments when null). */
export const mockPathname: { current: string | null } = { current: null };

export function resetRouterMock(): void {
  for (const fn of Object.values(mockRouter)) {
    fn.mockClear();
  }
  mockParams.current = {};
  mockSegments.current = ['(tabs)'];
  mockPathname.current = null;
}

function hrefText(href: unknown): string {
  if (typeof href === 'string') {
    return href;
  }
  const value = href as { pathname?: string; params?: Record<string, string> };
  let path = value.pathname ?? '';
  for (const [key, param] of Object.entries(value.params ?? {})) {
    path = path.replace(`[${key}]`, param);
  }
  return path;
}

function Link({
  href,
  children,
  replace,
  style,
}: {
  href: unknown;
  children: ReactNode;
  replace?: boolean;
  style?: unknown;
}) {
  return (
    <Text
      accessibilityRole="link"
      style={style as never}
      onPress={() => (replace ? mockRouter.replace(href) : mockRouter.push(href))}
      testID={`link-${hrefText(href)}`}
    >
      {children}
    </Text>
  );
}

/** Renders a screen's `headerRight` (its header buttons are part of what screen tests press). */
function Screen({ options }: { options?: unknown }) {
  const headerRight =
    options && typeof options === 'object'
      ? (options as { headerRight?: (props: object) => ReactNode }).headerRight
      : undefined;
  return headerRight ? <>{headerRight({})}</> : null;
}

function Navigator({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
Navigator.Screen = Screen;
Navigator.Protected = Navigator;

const navigationTheme = {
  dark: false,
  colors: { primary: '', background: '', card: '', text: '', border: '', notification: '' },
  fonts: {},
};

export function expoRouterMock() {
  return {
    __esModule: true,
    ThemeProvider: Navigator,
    DefaultTheme: navigationTheme,
    DarkTheme: { ...navigationTheme, dark: true },
    useRouter: () => mockRouter,
    router: mockRouter,
    useLocalSearchParams: () => mockParams.current,
    useGlobalSearchParams: () => mockParams.current,
    useSegments: () => mockSegments.current,
    useRootNavigationState: () => ({ key: 'root' }),
    usePathname: () =>
      mockPathname.current ??
      `/${mockSegments.current.filter((s) => !s.startsWith('(')).join('/')}`,
    useFocusEffect: () => undefined,
    Link,
    Stack: Navigator,
    Tabs: Navigator,
    Slot: Navigator,
    Redirect: () => null,
  };
}
