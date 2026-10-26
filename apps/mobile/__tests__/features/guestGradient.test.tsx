import { render } from '@testing-library/react-native';
import Svg, { Stop } from 'react-native-svg';

import { GradientFill, gradientStop } from '@/src/features/guest/GradientFill';
import { tokens } from '@/src/theme/tokens';

/**
 * The guest card's gradient (stage R15's card, fixed by stage R8's walk on the iPhone): its
 * `rgba` stops were drawn opaque on iOS and the drawing stopped 14 pt short of the card's edges.
 */
describe('gradientStop', () => {
  it('splits an rgba colour into the colour and its opacity', () => {
    expect(gradientStop('rgba(255, 143, 61, 0.14)')).toEqual({
      color: 'rgb(255, 143, 61)',
      opacity: 0.14,
    });
    expect(gradientStop(' rgba(45,212,191,0.06) ')).toEqual({
      color: 'rgb(45, 212, 191)',
      opacity: 0.06,
    });
  });

  it('keeps any other colour whole, at full opacity', () => {
    expect(gradientStop('#8b7bd8')).toEqual({ color: '#8b7bd8', opacity: 1 });
    expect(gradientStop('rgb(1, 2, 3)')).toEqual({ color: 'rgb(1, 2, 3)', opacity: 1 });
  });

  it('holds the opacity between 0 and 1', () => {
    expect(gradientStop('rgba(1, 2, 3, 1.5)').opacity).toBe(1);
  });
});

describe('GradientFill', () => {
  it('gives each stop its own opacity, so a faint tint stays faint on iOS', () => {
    const view = render(
      <GradientFill
        from="rgba(255, 143, 61, 0.14)"
        to="rgba(45, 212, 191, 0.06)"
        angle="diagonal"
        id="test-gradient"
      />
    );
    const stops = view.UNSAFE_getAllByType(Stop);
    expect(stops.map((stop) => [stop.props.stopColor, stop.props.stopOpacity])).toEqual([
      ['rgb(255, 143, 61)', 0.14],
      ['rgb(45, 212, 191)', 0.06],
    ]);
  });

  it('takes the whole box from its style alone, with no width or height of its own', () => {
    const view = render(
      <GradientFill from="#8b7bd8" to="#2e2652" angle="down" id="test-gradient-art" />
    );
    const svg = view.UNSAFE_getByType(Svg);
    expect(svg.props.width).toBeUndefined();
    expect(svg.props.height).toBeUndefined();
    expect(svg.props.style).toMatchObject({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("draws the guest card's colours of both themes faint (the mockup's 0.14 and 0.06)", () => {
    for (const scheme of [tokens.color.dark, tokens.color.light]) {
      for (const color of [scheme.guest.cardStart, scheme.guest.cardEnd]) {
        expect(gradientStop(color).opacity).toBeLessThan(0.2);
      }
    }
  });
});
