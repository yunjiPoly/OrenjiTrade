import { Redirect, usePathname } from 'expo-router';

import { wishlistLinkTarget } from '@/src/features/search/searchLinks';

/**
 * The old Wishlist tab (`/wishlist`): since stage R5 it is the Wishlist segment of Search (owner
 * spec 2026-10-14, section 4). Hidden from the tab bar; old links and notifications land there. It
 * redirects only while it is the screen on display.
 */
export default function WishlistRedirect() {
  return usePathname() === '/wishlist' ? <Redirect href={wishlistLinkTarget()} /> : null;
}
