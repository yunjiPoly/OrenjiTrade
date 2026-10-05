import { Linking } from 'react-native';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

import { PAGE_BASE_URL } from './leafletShared';

export { PAGE_BASE_URL };

/**
 * Only the map page itself loads in a WebView; a link (the OpenStreetMap credit) opens in the
 * system browser instead of replacing the map, and any other scheme is refused.
 */
export function shouldStartLoad(
  request: Pick<ShouldStartLoadRequest, 'url' | 'isTopFrame'>
): boolean {
  const { url } = request;
  if (url === PAGE_BASE_URL || url === 'about:blank' || url.startsWith('data:')) {
    return true;
  }
  if (request.isTopFrame === false) {
    return true;
  }
  if (/^https:\/\//.test(url)) {
    Linking.openURL(url).catch(() => undefined);
  }
  return false;
}
