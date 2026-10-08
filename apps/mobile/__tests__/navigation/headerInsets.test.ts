import { nativeHeaderInsetOptions } from '@/src/navigation/headerInsets';

describe('native stack header inset (Android)', () => {
  it('skips the native header inset when the window already sits below the status bar', () => {
    expect(nativeHeaderInsetOptions('android', 0)).toEqual({
      unstable_nativeProps: { headerConfig: { disableTopInsetApplication: true } },
    });
  });

  it('keeps it in an edge-to-edge window and on other platforms', () => {
    expect(nativeHeaderInsetOptions('android', 48)).toEqual({});
    expect(nativeHeaderInsetOptions('ios', 0)).toEqual({});
    expect(nativeHeaderInsetOptions('web', 0)).toEqual({});
  });
});
