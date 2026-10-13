import type { RegionsResponse } from '@orenji/api-client';

/** A small `GET /regions` answer for specs: three regions, a few countries and subdivisions. */
export const REGIONS_FIXTURE: RegionsResponse = {
  regions: [
    {
      code: 'americas-north',
      name: 'Americas (North)',
      isDefault: true,
      countries: [
        {
          code: 'CA',
          name: 'Canada',
          regionCode: 'americas-north',
          active: true,
          subdivisions: [
            { code: 'CA-ON', name: 'Ontario', wholeCountry: false },
            { code: 'CA-QC', name: 'Quebec', wholeCountry: false },
          ],
        },
        {
          code: 'PR',
          name: 'Puerto Rico',
          regionCode: 'americas-north',
          active: true,
          subdivisions: [{ code: 'PR', name: 'Puerto Rico', wholeCountry: true }],
        },
        {
          code: 'US',
          name: 'United States',
          regionCode: 'americas-north',
          active: true,
          subdivisions: [{ code: 'US-NY', name: 'New York', wholeCountry: false }],
        },
      ],
    },
    {
      code: 'americas-south',
      name: 'Americas (South)',
      isDefault: false,
      countries: [
        {
          code: 'AR',
          name: 'Argentina',
          regionCode: 'americas-south',
          active: true,
          subdivisions: [{ code: 'AR-C', name: 'Buenos Aires City', wholeCountry: false }],
        },
      ],
    },
    {
      code: 'europe',
      name: 'Europe',
      isDefault: false,
      countries: [
        {
          code: 'FR',
          name: 'France',
          regionCode: 'europe',
          active: true,
          subdivisions: [{ code: 'FR-IDF', name: 'Île-de-France', wholeCountry: false }],
        },
      ],
    },
  ],
};
