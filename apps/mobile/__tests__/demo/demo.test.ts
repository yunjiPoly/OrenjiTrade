import { demoAuthPort, demoFetch } from '@/src/demo/demo';

describe('the offline demo', () => {
  it('answers /me as an onboarded collector', async () => {
    const response = await demoFetch('https://demo.invalid/api/v1/me');
    expect(response.status).toBe(200);
    const me = await response.json();
    expect(me.status).toBe('ACTIVE');
    expect(me.requiredConsents).toEqual([]);
    expect(me.onboarding).toMatchObject({
      profileComplete: true,
      interestsSet: true,
      ageConfirmed: true,
    });
  });

  it('lists its one card, and prefers a literal path over a parameter', async () => {
    const page = await (
      await demoFetch('https://demo.invalid/api/v1/inventory/items?page=0')
    ).json();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].card.name).toBe('Ash Blossom & Joyous Spring');
    const summary = await (await demoFetch('https://demo.invalid/api/v1/inventory/summary')).json();
    expect(summary.totalItems).toBe(1);
  });

  it('answers a write without a server, and an unknown path with a problem', async () => {
    const created = await demoFetch('https://demo.invalid/api/v1/wishlist', { method: 'POST' });
    expect(created.status).toBeLessThan(300);
    expect((await demoFetch('https://demo.invalid/api/v1/nowhere')).status).toBe(404);
  });

  it('is always signed in', async () => {
    const user = await new Promise((resolve) => demoAuthPort.subscribe(resolve, () => undefined));
    expect(user).toMatchObject({ uid: 'demo', emailVerified: true });
    await expect(demoAuthPort.getIdToken(false)).resolves.toBe('demo');
  });
});
