import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  LEAFLET_CSS,
  LEAFLET_JS,
  LEAFLET_VERSION,
  OSM_TILE_URL,
} from '@/src/components/map/leaflet/leafletShared';
import {
  applyScript,
  focusScript,
  parsePageMessage,
  tradingAreaPageHtml,
} from '@/src/components/map/leaflet/tradingAreaPage';
import { chooseMapEngine } from '@/src/components/map/mapEngine';

describe('map engine (MapAdapter choice)', () => {
  it('uses Apple Maps on iOS, Google Maps only in an Android build with its own key', () => {
    expect(
      chooseMapEngine({ platform: 'ios', googleMapsKeyConfigured: false, inExpoGo: true })
    ).toBe('native');
    expect(
      chooseMapEngine({ platform: 'android', googleMapsKeyConfigured: true, inExpoGo: false })
    ).toBe('native');
  });

  it('falls back to Leaflet + OpenStreetMap in Expo Go or without a key, like the web', () => {
    for (const input of [
      { platform: 'android', googleMapsKeyConfigured: false, inExpoGo: true },
      { platform: 'android', googleMapsKeyConfigured: true, inExpoGo: true },
      { platform: 'android', googleMapsKeyConfigured: false, inExpoGo: false },
      { platform: 'web', googleMapsKeyConfigured: true, inExpoGo: false },
    ]) {
      expect(chooseMapEngine(input)).toBe('leaflet');
    }
  });
});

describe('Leaflet WebView page', () => {
  const options = {
    focus: { lat: 45.502, lng: -73.567, radiusKm: 10 },
    color: '#E8590C',
    background: '#F4EFEA',
    label: 'Trading area map "with" <markup>',
    pinTitle: 'Centre',
  };

  it('pins Leaflet to the npm package bytes (Subresource Integrity)', () => {
    const root = path.dirname(require.resolve('leaflet/package.json'));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      version: string;
    };
    expect(pkg.version).toBe(LEAFLET_VERSION);
    for (const [file, pinned] of [
      ['leaflet.js', LEAFLET_JS],
      ['leaflet.css', LEAFLET_CSS],
    ] as const) {
      const digest = createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'dist', file)))
        .digest('base64');
      expect(pinned.integrity).toBe(`sha256-${digest}`);
      expect(pinned.url).toBe(`https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/${file}`);
    }
    const html = tradingAreaPageHtml(options);
    expect(html).toContain(`src="${LEAFLET_JS.url}" integrity="${LEAFLET_JS.integrity}"`);
    expect(html).toContain(`href="${LEAFLET_CSS.url}" integrity="${LEAFLET_CSS.integrity}"`);
  });

  it('uses OpenStreetMap tiles with their credit and never the device location', () => {
    const html = tradingAreaPageHtml(options);
    expect(html).toContain(JSON.stringify(OSM_TILE_URL).slice(1, -1));
    expect(html).toContain('OpenStreetMap');
    expect(html).not.toMatch(/geolocation|locate\(|watchPosition|localStorage|sessionStorage/);
    expect(html).not.toMatch(/console\.log/);
  });

  it('escapes what it embeds', () => {
    const html = tradingAreaPageHtml({
      ...options,
      pinTitle: '</script><script>alert(1)</script>',
    });
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('aria-label="Trading area map &quot;with&quot; &lt;markup>"');
  });

  it('validates the messages of the page', () => {
    expect(parsePageMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parsePageMessage('{"type":"error"}')).toEqual({ type: 'error', reason: 'unknown' });
    expect(parsePageMessage('{"type":"pick","lat":45.5,"lng":-73.6}')).toEqual({
      type: 'pick',
      lat: 45.5,
      lng: -73.6,
    });
    expect(parsePageMessage('{"type":"viewport","lat":45.5,"lng":-73.6}')).toMatchObject({
      type: 'viewport',
    });
    for (const bad of [
      'nope',
      'null',
      '"pick"',
      '{"type":"pick","lat":91,"lng":0}',
      '{"type":"pick","lat":0,"lng":181}',
      '{"type":"pick","lat":"1","lng":0}',
      '{"type":"viewport","lat":null,"lng":0}',
      '{"type":"other"}',
    ]) {
      expect(parsePageMessage(bad)).toBeNull();
    }
  });

  it('builds the scripts that draw the area and move the camera', () => {
    expect(applyScript({ lat: 45.5, lng: -73.6, radiusKm: 5 }, false)).toBe(
      'window.__orenji&&window.__orenji.apply({"area":{"lat":45.5,"lng":-73.6,"radiusKm":5},"disabled":false});true;'
    );
    expect(applyScript(null, true)).toBe(
      'window.__orenji&&window.__orenji.apply({"area":null,"disabled":true});true;'
    );
    expect(focusScript({ lat: 46.813, lng: -71.208, radiusKm: 15 })).toBe(
      'window.__orenji&&window.__orenji.focus({"lat":46.813,"lng":-71.208,"radiusKm":15});true;'
    );
  });
});
