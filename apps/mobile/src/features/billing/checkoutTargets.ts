import { safeAppPath } from '@/src/features/notifications/notificationKinds';

/**
 * Where a provider's answer sends the collector (mirror of the web's `checkoutTarget` and the
 * trade page's pay step): the app's own screen for a local fake checkout, or an https page of a
 * real provider (opened in the browser). Anything else is refused (`null`).
 */
export type CheckoutTarget =
  | { kind: 'app'; screen: 'payment' | 'billing' | 'donation'; ref: string }
  | { kind: 'external'; url: string };

const FAKE_CHECKOUT = /^\/checkout\/(fake|fake-billing|fake-donation)\/([\w-]{1,80})$/;
const HTTPS_PAGE = /^https:\/\/[^\s/]+\/\S*$/;

const SCREENS = {
  fake: 'payment',
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

/** The checkout of `POST /trades/{id}/pay`: the fake payment checkout or a provider page. */
export function payTarget(payment: { checkoutUrl?: string | null }): CheckoutTarget | null {
  const target = checkoutTarget(payment.checkoutUrl);
  return target && (target.kind === 'external' || target.screen === 'payment') ? target : null;
}

/** The app screen of a fake checkout target. */
export function checkoutPathname(
  screen: 'payment' | 'billing' | 'donation'
): '/checkout/fake/[ref]' | '/checkout/fake-billing/[ref]' | '/checkout/fake-donation/[ref]' {
  switch (screen) {
    case 'billing':
      return '/checkout/fake-billing/[ref]';
    case 'donation':
      return '/checkout/fake-donation/[ref]';
    default:
      return '/checkout/fake/[ref]';
  }
}

const TRADE_PATH = /^\/trades\/[\w-]{1,64}$/;

/** `?returnTo=` of Settings → Payouts when it is a trade of this app ("Back to your trade"). */
export function payoutReturnPath(value: string | null | undefined): string | null {
  const path = safeAppPath(value);
  return path && TRADE_PATH.test(path) ? path : null;
}
