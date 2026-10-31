import type { CardImageCacheStatus } from '@orenji/api-client';
import {
  durationText,
  etiquette,
  gameImages,
  gameImagesLine,
  imageLimitError,
  imagesLabel,
  mbText,
  meterSegments,
  runStatus,
  sourceName,
} from './card-data';

const MB = 1024 * 1024;

function status(games: CardImageCacheStatus['games']): CardImageCacheStatus {
  return {
    usedBytes: 0,
    reservedBytes: 0,
    remainingBytes: 0,
    limitBytes: 5120 * MB,
    usedMb: 0,
    reservedMb: 0,
    remainingMb: 5120,
    limitMb: 5120,
    files: 0,
    activeReservations: 0,
    images: {},
    games,
  };
}

describe('card data and images (board A12)', () => {
  it('names sources and keeps the etiquette line (version first, each source’s pace)', () => {
    expect(sourceName('ygoprodeck')).toBe('YGOPRODeck');
    expect(sourceName(null)).toBe('No source');
    expect(etiquette('ygoprodeck')).toContain('checks the source’s database version first');
    expect(etiquette('ygoprodeck')).toContain('at most 5 requests a second');
    // Review fix 1 (U10): Scryfall's bulk file at most daily, 8 requests a second (application.yml).
    expect(etiquette('scryfall')).toContain('bulk file at most once a day');
    expect(etiquette('scryfall')).toContain('at most 8 requests a second');
    expect(etiquette('mock')).toContain('never call a provider');
  });

  it('validates the "Up to …" number and labels a run’s images', () => {
    expect(imageLimitError('')).toBe('Use a whole number from 1 to 1,000,000.');
    expect(imageLimitError('0')).not.toBeNull();
    expect(imageLimitError('1.5')).not.toBeNull();
    expect(imageLimitError('1000001')).not.toBeNull();
    expect(imageLimitError('2000')).toBeNull();
    expect(imagesLabel({ imageMode: 'LIMIT', imageLimit: 2000 })).toBe('Up to 2,000');
    expect(imagesLabel({ imageMode: 'REFERENCED' })).toBe('Only images in use');
  });

  it('reads a running run’s phase', () => {
    expect(runStatus({ status: 'RUNNING', phase: 'IMAGES' })).toEqual({
      label: 'Running · Images',
      tone: 'info',
    });
    expect(runStatus({ status: 'QUEUED' }).label).toBe('Queued');
    expect(runStatus({ status: 'FAILED' }).tone).toBe('danger');
  });

  it('splits the meter by game and leaves empty games out (WH1’s A15)', () => {
    expect(meterSegments(status([]))).toEqual([]);
    expect(
      meterSegments(
        status([
          { game: 'yugioh', provider: 'ygoprodeck', images: {}, cachedBytes: 512 * MB },
          { game: 'mtg', provider: 'scryfall', images: {}, cachedBytes: 0 },
        ]),
      ),
    ).toEqual([{ game: 'yugioh', mb: 512, percent: 10 }]);
  });

  it('sums a game’s images over its providers', () => {
    const rows = gameImages(
      status([
        {
          game: 'yugioh',
          provider: 'ygoprodeck',
          images: { CACHED: 10, NOT_CACHED: 2, MISSING_AT_SOURCE: 1 },
          cachedBytes: MB,
        },
        { game: 'yugioh', provider: 'mock', images: { CACHED: 5 }, cachedBytes: MB },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cached).toBe(15);
    expect(gameImagesLine(rows[0])).toBe('15 cached · 2 not cached · 1 missing at the source');
    expect(mbText(rows[0].mb)).toBe('2');
    expect(mbText(3413.4)).toBe('3,413');
  });

  it('reads durations', () => {
    expect(durationText(8.2)).toBe('8 s');
    expect(durationText(411)).toBe('6 min 51 s');
  });
});
