import { UrlSegment } from '@angular/router';
import { optionalParamMatcher } from './optional-param.matcher';

function segments(...paths: string[]): UrlSegment[] {
  return paths.map((path) => new UrlSegment(path, {}));
}

describe('optionalParamMatcher', () => {
  const matcher = optionalParamMatcher('wishlist', 'id');
  const match = (...paths: string[]) =>
    (matcher as (s: UrlSegment[]) => ReturnType<typeof matcher>)(segments(...paths));

  it('matches the bare path without parameters', () => {
    const result = match('wishlist');
    expect(result?.consumed.map((segment) => segment.path)).toEqual(['wishlist']);
    expect(result?.posParams).toEqual({});
  });

  it('matches one extra segment as the named parameter', () => {
    const result = match('wishlist', 'abc-123');
    expect(result?.consumed).toHaveLength(2);
    expect(result?.posParams?.['id'].path).toBe('abc-123');
  });

  it('ignores other paths and deeper URLs', () => {
    expect(match('wish')).toBeNull();
    expect(match('messages', 'x')).toBeNull();
    expect(match('wishlist', 'a', 'b')).toBeNull();
    expect(match()).toBeNull();
  });
});
