import { render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Stop } from 'react-native-svg';

import { GradientFill, gradientStop } from '@/src/features/guest/GradientFill';
import { GuestCard } from '@/src/features/guest/GuestParts';
import { tokens } from '@/src/theme/tokens';

import { resetRouterMock } from '../support/router';
import { renderWithProviders, resetAppState } from '../test-utils';

jest.mock('expo-router', () => require('../support/router').expoRouterMock());

/**
 * The guest card's gradient (stage R15's card, fixed by stage R8's walk on the iPhone): its
 * `rgba` stops were drawn opaque on iOS and the drawing stopped 14 pt short of the card's edges;
 * R8's review (F1) found the web build's drawing at the browser's default 300 by 150.
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

  it('fills the whole box on iOS and the web: 100 % of a frame without padding', () => {
    const view = render(
      <GradientFill from="#8b7bd8" to="#2e2652" angle="down" id="test-gradient-art" testID="art" />
    );
    // The frame: the box's whole inside (absoluteFill), with no padding, never touched.
    const frame = view.getByTestId('art-frame');
    expect(StyleSheet.flatten(frame.props.style)).toEqual({
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(frame.props.pointerEvents).toBe('none');
    // The drawing: 100 % of the frame. Without a width and height the web draws an <svg> at the
    // browser's 300 by 150 (R8's review F1); on an absoluteFill <Svg> itself, iOS sized 100 % to
    // the card's content box, 14 pt short of each edge (R8's walk). Neither platform has a branch.
    const svg = within(frame).getByTestId('art');
    expect(svg.props.width).toBe('100%');
    expect(svg.props.height).toBe('100%');
    expect(StyleSheet.flatten(svg.props.style) ?? {}).not.toHaveProperty('position', 'absolute');
  });

  it("draws the guest card's colours of both themes faint (the mockup's 0.14 and 0.06)", () => {
    for (const scheme of [tokens.color.dark, tokens.color.light]) {
      for (const color of [scheme.guest.cardStart, scheme.guest.cardEnd]) {
        expect(gradientStop(color).opacity).toBeLessThan(0.2);
      }
    }
  });
});

describe('GuestCard', () => {
  beforeEach(() => {
    resetRouterMock();
    resetAppState();
  });

  it.each(['light', 'dark'] as const)(
    'draws its faint tint of the %s theme behind the card, in a frame of its own',
    (scheme) => {
      const palette = tokens.color[scheme];
      renderWithProviders(<GuestCard />, { scheme });
      const card = screen.getByTestId('home-guest-card');
      const frame = within(card).getByTestId('home-guest-card-gradient-frame');
      expect(StyleSheet.flatten(frame.props.style)).toMatchObject({ position: 'absolute' });
      const svg = within(frame).getByTestId('home-guest-card-gradient');
      const stops = svg.findAll((node) => node.type === Stop);
      expect(stops.map((stop) => [stop.props.stopColor, stop.props.stopOpacity])).toEqual([
        [
          gradientStop(palette.guest.cardStart).color,
          gradientStop(palette.guest.cardStart).opacity,
        ],
        [gradientStop(palette.guest.cardEnd).color, gradientStop(palette.guest.cardEnd).opacity],
      ]);
      // Faint: the mockup's 0.12 to 0.14, then 0.06, never the opaque orange and teal of R8's walk.
      for (const stop of stops) {
        expect(stop.props.stopOpacity).toBeGreaterThan(0);
        expect(stop.props.stopOpacity).toBeLessThan(0.2);
      }
    }
  );
});
