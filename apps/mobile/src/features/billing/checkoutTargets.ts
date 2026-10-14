import { safeAppPath } from '@/src/features/notifications/notificationKinds';

/**
 * Where a provider's answer sends the collector (mirror of the web's `checkoutTarget`): the app's
 * own screen for a local fake Premium or donation checkout, or an https page of a real provider
 * (opened in the browser). Anything else is refused (`null`), the protected-payment checkout
 * included: offers, trades and protected payments left the phone (ADR 0018).
 */
export type CheckoutTarget =
  { kind: 'app'; screen: 'billing' | 'donation'; ref: string } | { kind: 'external'; url: string };

const FAKE_CHECKOUT = /^\/checkout\/(fake-billing|fake-donation)\/([\w-]{1,80})$/;
const HTTPS_PAGE = /^https:\/\/[^\s/]+\/\S*$/;

const SCREENS = {
  'fake-billing': 'billing',
  'fake-donation': 'donation',
} as const;

export function checkoutTarget(url: string | null | undefined): CheckoutTarget | null {
  if (!url) {
    return null;
  }
  const path = safeAppPath(url);
  const match = path ? FAKE_CHECKOUT.exec(path) : null;
  if (match?.[1] && match[2]) {
    return { kind: 'app', screen: SCREENS[match[1] as keyof typeof SCREENS], ref: match[2] };
  }
  return HTTPS_PAGE.test(url) ? { kind: 'external', url } : null;
}

/** The app screen of a fake checkout target. */
export function checkoutPathname(
  screen: 'billing' | 'donation'
): '/checkout/fake-billing/[ref]' | '/checkout/fake-donation/[ref]' {
  return screen === 'billing' ? '/checkout/fake-billing/[ref]' : '/checkout/fake-donation/[ref]';
}
