import { resolveMediaUrl } from './media-url.pipe';

describe('resolveMediaUrl', () => {
  it('points API-relative paths at the API origin', () => {
    expect(resolveMediaUrl('/api/v1/public/media/uploads/a.jpg', 'http://localhost:8080/')).toBe(
      'http://localhost:8080/api/v1/public/media/uploads/a.jpg',
    );
    // Same-origin deployments (empty base) keep the path.
    expect(resolveMediaUrl('/api/v1/public/media/a.jpg', '')).toBe('/api/v1/public/media/a.jpg');
  });

  it('keeps absolute, protocol-relative and missing URLs', () => {
    expect(resolveMediaUrl('https://cdn.test/a.jpg', 'http://api.test')).toBe(
      'https://cdn.test/a.jpg',
    );
    expect(resolveMediaUrl('//cdn.test/a.jpg', 'http://api.test')).toBe('//cdn.test/a.jpg');
    expect(resolveMediaUrl('blob:preview', 'http://api.test')).toBe('blob:preview');
    expect(resolveMediaUrl(null, 'http://api.test')).toBeNull();
    expect(resolveMediaUrl('', 'http://api.test')).toBeNull();
  });
});
