// Platform regions, their countries and the rules that turn Natural Earth admin-1 features into
// the ISO 3166-2 subdivision codes seeded for profiles (ADR 0017). Pure data: read by
// build-lookup.mjs (seed + lookup CSV) and build-boundaries.mjs (boundary assets), so the codes
// of the database and of the map match by construction.
//
// Sources: Natural Earth 10m admin-1 states/provinces 5.1.1 (public domain,
// https://www.naturalearthdata.com/about/terms-of-use/) for the shapes, codes and most names;
// ISO 3166-2 first-level codes as the target (checked against the Debian iso-codes 4.20.1 list
// while authoring these tables; that list is not copied or used at build time). Names are
// English common names; a "whole" country has no subdivision list of its own (territories,
// microstates, or countries whose Natural Earth units no longer match ISO 3166-2) and gets one
// pseudo-subdivision whose code is its ISO 3166-1 alpha-2 code.

/** The three platform regions; americas-north is the default. */
export const REGIONS = [
  { code: 'americas-north', name: 'Americas (North)', sortOrder: 1, isDefault: true },
  { code: 'americas-south', name: 'Americas (South)', sortOrder: 2, isDefault: false },
  { code: 'europe', name: 'Europe', sortOrder: 3, isDefault: false },
];

/**
 * Countries per region. `mode`:
 * - `iso`      the feature's iso_3166_2 (after CODE_REMAP / NE_ID_CODE) is the subdivision code;
 * - `whole`    the whole country is one pseudo-subdivision coded with its alpha-2 code;
 * - `dissolve` DISSOLVE[country](feature) gives the code (several features per subdivision).
 */
export const COUNTRIES = [
  // --- Americas (North): Canada, United States, Mexico, Central America, Caribbean ----------
  { code: 'CA', name: 'Canada', region: 'americas-north', mode: 'iso' },
  { code: 'US', name: 'United States', region: 'americas-north', mode: 'iso' },
  { code: 'MX', name: 'Mexico', region: 'americas-north', mode: 'iso' },
  { code: 'BZ', name: 'Belize', region: 'americas-north', mode: 'iso' },
  { code: 'CR', name: 'Costa Rica', region: 'americas-north', mode: 'iso' },
  { code: 'SV', name: 'El Salvador', region: 'americas-north', mode: 'iso' },
  { code: 'GT', name: 'Guatemala', region: 'americas-north', mode: 'iso' },
  { code: 'HN', name: 'Honduras', region: 'americas-north', mode: 'iso' },
  { code: 'NI', name: 'Nicaragua', region: 'americas-north', mode: 'iso' },
  { code: 'PA', name: 'Panama', region: 'americas-north', mode: 'iso' },
  { code: 'AG', name: 'Antigua and Barbuda', region: 'americas-north', mode: 'iso' },
  { code: 'BS', name: 'Bahamas', region: 'americas-north', mode: 'iso' },
  { code: 'BB', name: 'Barbados', region: 'americas-north', mode: 'iso' },
  { code: 'CU', name: 'Cuba', region: 'americas-north', mode: 'iso' },
  { code: 'DM', name: 'Dominica', region: 'americas-north', mode: 'iso' },
  { code: 'DO', name: 'Dominican Republic', region: 'americas-north', mode: 'dissolve' },
  { code: 'GD', name: 'Grenada', region: 'americas-north', mode: 'iso' },
  { code: 'HT', name: 'Haiti', region: 'americas-north', mode: 'iso' },
  { code: 'JM', name: 'Jamaica', region: 'americas-north', mode: 'iso' },
  { code: 'KN', name: 'Saint Kitts and Nevis', region: 'americas-north', mode: 'dissolve' },
  { code: 'LC', name: 'Saint Lucia', region: 'americas-north', mode: 'whole' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', region: 'americas-north', mode: 'iso' },
  { code: 'TT', name: 'Trinidad and Tobago', region: 'americas-north', mode: 'iso' },
  { code: 'BM', name: 'Bermuda', region: 'americas-north', mode: 'whole' },
  { code: 'PR', name: 'Puerto Rico', region: 'americas-north', mode: 'whole' },
  { code: 'AI', name: 'Anguilla', region: 'americas-north', mode: 'whole' },
  { code: 'AW', name: 'Aruba', region: 'americas-north', mode: 'whole' },
  { code: 'BQ', name: 'Caribbean Netherlands', region: 'americas-north', mode: 'whole' },
  { code: 'VG', name: 'British Virgin Islands', region: 'americas-north', mode: 'whole' },
  { code: 'KY', name: 'Cayman Islands', region: 'americas-north', mode: 'whole' },
  { code: 'CW', name: 'Curaçao', region: 'americas-north', mode: 'whole' },
  { code: 'GP', name: 'Guadeloupe', region: 'americas-north', mode: 'whole' },
  { code: 'MQ', name: 'Martinique', region: 'americas-north', mode: 'whole' },
  { code: 'MS', name: 'Montserrat', region: 'americas-north', mode: 'whole' },
  { code: 'BL', name: 'Saint Barthélemy', region: 'americas-north', mode: 'whole' },
  { code: 'MF', name: 'Saint Martin (French part)', region: 'americas-north', mode: 'whole' },
  { code: 'SX', name: 'Sint Maarten (Dutch part)', region: 'americas-north', mode: 'whole' },
  { code: 'TC', name: 'Turks and Caicos Islands', region: 'americas-north', mode: 'whole' },
  { code: 'VI', name: 'U.S. Virgin Islands', region: 'americas-north', mode: 'whole' },
  // --- Americas (South): South American countries -------------------------------------------
  { code: 'AR', name: 'Argentina', region: 'americas-south', mode: 'iso' },
  { code: 'BO', name: 'Bolivia', region: 'americas-south', mode: 'iso' },
  { code: 'BR', name: 'Brazil', region: 'americas-south', mode: 'iso' },
  { code: 'CL', name: 'Chile', region: 'americas-south', mode: 'iso' },
  { code: 'CO', name: 'Colombia', region: 'americas-south', mode: 'iso' },
  { code: 'EC', name: 'Ecuador', region: 'americas-south', mode: 'iso' },
  { code: 'GY', name: 'Guyana', region: 'americas-south', mode: 'iso' },
  { code: 'PY', name: 'Paraguay', region: 'americas-south', mode: 'iso' },
  { code: 'PE', name: 'Peru', region: 'americas-south', mode: 'iso' },
  { code: 'SR', name: 'Suriname', region: 'americas-south', mode: 'iso' },
  { code: 'UY', name: 'Uruguay', region: 'americas-south', mode: 'iso' },
  { code: 'VE', name: 'Venezuela', region: 'americas-south', mode: 'iso' },
  { code: 'FK', name: 'Falkland Islands', region: 'americas-south', mode: 'whole' },
  { code: 'GF', name: 'French Guiana', region: 'americas-south', mode: 'whole' },
  // --- Europe: EU 27 + EFTA + UK + Western Balkans + MD, UA, BY + dependencies ---------------
  { code: 'AL', name: 'Albania', region: 'europe', mode: 'iso' },
  { code: 'AD', name: 'Andorra', region: 'europe', mode: 'iso' },
  { code: 'AT', name: 'Austria', region: 'europe', mode: 'iso' },
  { code: 'BY', name: 'Belarus', region: 'europe', mode: 'iso' },
  { code: 'BE', name: 'Belgium', region: 'europe', mode: 'dissolve' },
  { code: 'BA', name: 'Bosnia and Herzegovina', region: 'europe', mode: 'dissolve' },
  { code: 'BG', name: 'Bulgaria', region: 'europe', mode: 'iso' },
  { code: 'HR', name: 'Croatia', region: 'europe', mode: 'iso' },
  { code: 'CY', name: 'Cyprus', region: 'europe', mode: 'iso' },
  { code: 'CZ', name: 'Czechia', region: 'europe', mode: 'iso' },
  { code: 'DK', name: 'Denmark', region: 'europe', mode: 'iso' },
  { code: 'EE', name: 'Estonia', region: 'europe', mode: 'iso' },
  { code: 'FO', name: 'Faroe Islands', region: 'europe', mode: 'whole' },
  { code: 'FI', name: 'Finland', region: 'europe', mode: 'iso' },
  { code: 'AX', name: 'Åland Islands', region: 'europe', mode: 'whole' },
  { code: 'FR', name: 'France', region: 'europe', mode: 'dissolve' },
  { code: 'DE', name: 'Germany', region: 'europe', mode: 'iso' },
  { code: 'GI', name: 'Gibraltar', region: 'europe', mode: 'whole' },
  { code: 'GR', name: 'Greece', region: 'europe', mode: 'iso' },
  { code: 'GG', name: 'Guernsey', region: 'europe', mode: 'whole' },
  { code: 'HU', name: 'Hungary', region: 'europe', mode: 'iso' },
  { code: 'IS', name: 'Iceland', region: 'europe', mode: 'iso' },
  { code: 'IE', name: 'Ireland', region: 'europe', mode: 'dissolve' },
  { code: 'IM', name: 'Isle of Man', region: 'europe', mode: 'whole' },
  { code: 'IT', name: 'Italy', region: 'europe', mode: 'dissolve' },
  { code: 'JE', name: 'Jersey', region: 'europe', mode: 'whole' },
  { code: 'XK', name: 'Kosovo', region: 'europe', mode: 'whole' },
  { code: 'LV', name: 'Latvia', region: 'europe', mode: 'whole' },
  { code: 'LI', name: 'Liechtenstein', region: 'europe', mode: 'iso' },
  { code: 'LT', name: 'Lithuania', region: 'europe', mode: 'iso' },
  { code: 'LU', name: 'Luxembourg', region: 'europe', mode: 'whole' },
  { code: 'MT', name: 'Malta', region: 'europe', mode: 'iso' },
  { code: 'MD', name: 'Moldova', region: 'europe', mode: 'iso' },
  { code: 'MC', name: 'Monaco', region: 'europe', mode: 'whole' },
  { code: 'ME', name: 'Montenegro', region: 'europe', mode: 'iso' },
  { code: 'NL', name: 'Netherlands', region: 'europe', mode: 'iso' },
  { code: 'MK', name: 'North Macedonia', region: 'europe', mode: 'whole' },
  { code: 'NO', name: 'Norway', region: 'europe', mode: 'iso' },
  { code: 'PL', name: 'Poland', region: 'europe', mode: 'iso' },
  { code: 'PT', name: 'Portugal', region: 'europe', mode: 'iso' },
  { code: 'RO', name: 'Romania', region: 'europe', mode: 'iso' },
  { code: 'SM', name: 'San Marino', region: 'europe', mode: 'iso' },
  { code: 'RS', name: 'Serbia', region: 'europe', mode: 'iso' },
  { code: 'SK', name: 'Slovakia', region: 'europe', mode: 'iso' },
  { code: 'SI', name: 'Slovenia', region: 'europe', mode: 'whole' },
  { code: 'ES', name: 'Spain', region: 'europe', mode: 'dissolve' },
  { code: 'SE', name: 'Sweden', region: 'europe', mode: 'iso' },
  { code: 'CH', name: 'Switzerland', region: 'europe', mode: 'iso' },
  { code: 'UA', name: 'Ukraine', region: 'europe', mode: 'iso' },
  { code: 'GB', name: 'United Kingdom', region: 'europe', mode: 'dissolve' },
  { code: 'VA', name: 'Vatican City', region: 'europe', mode: 'whole' },
];

/**
 * Natural Earth features that belong to another country than their iso_a2 / code prefix says
 * (overseas departments and Caribbean municipalities that are countries in ISO 3166-1, and Crimea
 * and Sevastopol, which ISO 3166 lists under Ukraine). `null` drops the feature.
 */
export const FEATURE_COUNTRY = {
  'FR-GF': 'GF',
  'FR-GP': 'GP',
  'FR-MQ': 'MQ',
  'FR-RE': null, // Réunion: outside the three regions
  'FR-YT': null, // Mayotte: outside the three regions
  'NL-BQ1': 'BQ',
  'NL-BQ2': 'BQ',
  'NL-BQ3': 'BQ',
  'US-PR': 'PR',
  'UA-43': 'UA',
  'UA-40': 'UA',
  'NO-21': null, // Svalbard: not seeded
  'NO-X01~': null, // Bouvet Island: uninhabited
  'CO-X01~': null, // Malpelo Island: uninhabited
  'VE-X01~': null, // Isla de Aves: uninhabited
};

/** Old or non-ISO Natural Earth codes → current ISO 3166-2 codes (iso mode). */
export const CODE_REMAP = {
  'MX-DIF': 'MX-CMX',
  'MX-X01~': 'MX-YUC', // Arrecife Alacranes islands, Yucatán
  ...prefixMap('GT', {
    GU: '01', PR: '02', SA: '03', CM: '04', ES: '05', SR: '06', SO: '07', TO: '08', QZ: '09',
    SU: '10', RE: '11', SM: '12', HU: '13', QC: '14', BV: '15', AV: '16', PE: '17', IZ: '18',
    ZA: '19', CQ: '20', JA: '21', JU: '22',
  }),
  'BS-X01~': 'BS-NP', // New Providence
  'TT-RCM': 'TT-MRC',
  'TT-ETO': 'TT-TOB',
  'TT-WTO': 'TT-TOB',
  ...prefixMap('CZ', {
    PR: '10', ST: '20', JC: '31', PL: '32', KA: '41', US: '42', LI: '51', KR: '52', PA: '53',
    VY: '63', JM: '64', OL: '71', ZL: '72', MO: '80',
  }),
  ...prefixMap('EE', {
    44: '45', 49: '50', 51: '52', 57: '56', 59: '60', 65: '64', 67: '68', 70: '71', 78: '79',
    82: '81', 86: '87',
  }),
  'GR-A1': 'GR-I',
  'HU-ED': 'HU-ER',
  'IS-0': 'IS-1', // Reykjavík lies in the capital region
  'MD-CAM': 'MD-SN',
  'MD-GRI': 'MD-SN',
  ...prefixMap('NO', {
    '01': '30', '02': '30', '06': '30', '04': '34', '05': '34', '07': '38', '08': '38',
    '09': '42', 10: '42', 12: '46', 14: '46', 16: '50', 17: '50', 19: '54', 20: '54',
  }),
  ...prefixMap('PL', {
    DS: '02', KP: '04', LU: '06', LB: '08', LD: '10', MA: '12', MZ: '14', OP: '16', PK: '18',
    PD: '20', PM: '22', SL: '24', SK: '26', WN: '28', WP: '30', ZP: '32',
  }),
  ...prefixMap('RS', { '01': 'VO', '02': 'VO', '03': 'VO', '04': 'VO', '05': 'VO', '06': 'VO', '07': 'VO' }),
};

/** Single Natural Earth features whose code is wrong or duplicated in 5.1.1 (by ne_id). */
export const NE_ID_CODE = {
  1159312541: 'HR-11', // second "HR-12" polygon, centred on Požega
  1159310131: 'CO-DC', // Bogotá, coded CO-CUN in Natural Earth
  1159307965: 'PE-LMA', // Lima Province (metropolitan Lima), coded PE-LIM
  1159311149: 'MD-SN', // left-bank part coded MD-RE
};

/** Dissolve rules: feature → subdivision code. */
export const DISSOLVE = {
  DO: (f) => `DO-${DO_PROVINCE_REGION[f.iso_3166_2.slice(3)]}`,
  KN: (f) => (['04', '05', '07', '10', '12'].includes(f.iso_3166_2.slice(3)) ? 'KN-N' : 'KN-K'),
  BE: (f) => ({ Flemish: 'BE-VLG', Walloon: 'BE-WAL', 'Capital Region': 'BE-BRU' })[f.region],
  BA: (f) => {
    if (f.iso_3166_2 === 'BA-BRC') return 'BA-BRC';
    return FEDERATION_CANTONS.has(f.name) ? 'BA-BIH' : 'BA-SRP';
  },
  FR: (f) => {
    const code = f.region_cod.trim();
    return code === 'FR-COR' ? 'FR-20R' : code;
  },
  IE: (f) => `IE-${IE_COUNTY_PROVINCE[f.iso_3166_2.slice(3)]}`,
  IT: (f) => f.region_cod.trim(),
  ES: (f) => {
    const community = f.region_cod.trim().replace('.', '-');
    if (community === 'ES-CE') return f.region === 'Melilla' ? 'ES-ML' : 'ES-CE';
    return { 'ES-MU': 'ES-MC', 'ES-PM': 'ES-IB', 'ES-NA': 'ES-NC', 'ES-LO': 'ES-RI' }[community] ?? community;
  },
  GB: (f) =>
    ({ England: 'GB-ENG', Scotland: 'GB-SCT', Wales: 'GB-WLS', 'Northern Ireland': 'GB-NIR' })[
      f.geonunit
    ],
};

/** Names of dissolved subdivisions and name overrides of iso-mode subdivisions. */
export const NAMES = {
  // Dominican Republic: development regions (ISO 3166-2 first level since 2023)
  'DO-33': 'Cibao Nordeste', 'DO-34': 'Cibao Noroeste', 'DO-35': 'Cibao Norte', 'DO-36': 'Cibao Sur',
  'DO-37': 'El Valle', 'DO-38': 'Enriquillo', 'DO-39': 'Higuamo', 'DO-40': 'Ozama',
  'DO-41': 'Valdesia', 'DO-42': 'Yuma',
  'KN-K': 'Saint Kitts', 'KN-N': 'Nevis',
  'BE-VLG': 'Flanders', 'BE-WAL': 'Wallonia', 'BE-BRU': 'Brussels-Capital Region',
  'BA-BIH': 'Federation of Bosnia and Herzegovina', 'BA-SRP': 'Republika Srpska', 'BA-BRC': 'Brčko District',
  'FR-ARA': 'Auvergne-Rhône-Alpes', 'FR-BFC': 'Bourgogne-Franche-Comté', 'FR-BRE': 'Brittany',
  'FR-CVL': 'Centre-Val de Loire', 'FR-20R': 'Corsica', 'FR-GES': 'Grand Est',
  'FR-HDF': 'Hauts-de-France', 'FR-IDF': 'Île-de-France', 'FR-NOR': 'Normandy',
  'FR-NAQ': 'Nouvelle-Aquitaine', 'FR-OCC': 'Occitanie', 'FR-PDL': 'Pays de la Loire',
  'FR-PAC': "Provence-Alpes-Côte d'Azur",
  'IE-C': 'Connacht', 'IE-L': 'Leinster', 'IE-M': 'Munster', 'IE-U': 'Ulster',
  'IT-21': 'Piedmont', 'IT-23': 'Aosta Valley', 'IT-25': 'Lombardy', 'IT-32': 'Trentino-South Tyrol',
  'IT-34': 'Veneto', 'IT-36': 'Friuli-Venezia Giulia', 'IT-42': 'Liguria', 'IT-45': 'Emilia-Romagna',
  'IT-52': 'Tuscany', 'IT-55': 'Umbria', 'IT-57': 'Marche', 'IT-62': 'Lazio', 'IT-65': 'Abruzzo',
  'IT-67': 'Molise', 'IT-72': 'Campania', 'IT-75': 'Apulia', 'IT-77': 'Basilicata',
  'IT-78': 'Calabria', 'IT-82': 'Sicily', 'IT-88': 'Sardinia',
  'ES-AN': 'Andalusia', 'ES-AR': 'Aragon', 'ES-AS': 'Asturias', 'ES-CB': 'Cantabria',
  'ES-CE': 'Ceuta', 'ES-CL': 'Castile and León', 'ES-CM': 'Castilla-La Mancha',
  'ES-CN': 'Canary Islands', 'ES-CT': 'Catalonia', 'ES-EX': 'Extremadura', 'ES-GA': 'Galicia',
  'ES-IB': 'Balearic Islands', 'ES-MC': 'Region of Murcia', 'ES-MD': 'Community of Madrid',
  'ES-ML': 'Melilla', 'ES-NC': 'Navarre', 'ES-PV': 'Basque Country', 'ES-RI': 'La Rioja',
  'ES-VC': 'Valencian Community',
  'GB-ENG': 'England', 'GB-NIR': 'Northern Ireland', 'GB-SCT': 'Scotland', 'GB-WLS': 'Wales',
  // iso-mode codes that changed, whose Natural Earth name is outdated or shared by two units
  'AR-C': 'Buenos Aires City', 'AR-B': 'Buenos Aires Province',
  'BG-22': 'Sofia City', 'BG-23': 'Sofia Province', 'BY-HM': 'Minsk City', 'BY-MI': 'Minsk Region',
  'GY-ES': 'Essequibo Islands-West Demerara', 'HR-01': 'Zagreb County', 'HR-21': 'City of Zagreb',
  'HU-VE': 'Veszprém County', 'HU-VM': 'Veszprém (city)', 'UA-30': 'Kyiv City', 'UA-32': 'Kyiv Oblast',
  'US-DC': 'District of Columbia', 'CL-RM': 'Santiago Metropolitan Region',
  'MX-CMX': 'Mexico City',
  'TT-MRC': 'Mayaro-Rio Claro', 'TT-TOB': 'Tobago',
  'CO-DC': 'Bogotá Capital District', 'PE-LMA': 'Lima Metropolitan Area', 'VE-X': 'La Guaira',
  'HR-11': 'Požega-Slavonia', 'GR-I': 'Attica', 'HU-ER': 'Érd', 'IS-1': 'Capital Region',
  'MD-SN': 'Stînga Nistrului (Transnistria)', 'RS-VO': 'Vojvodina',
  'NO-30': 'Viken', 'NO-34': 'Innlandet', 'NO-38': 'Vestfold og Telemark', 'NO-42': 'Agder',
  'NO-46': 'Vestland', 'NO-50': 'Trøndelag', 'NO-54': 'Troms og Finnmark',
  'CZ-10': 'Prague', 'CZ-20': 'Central Bohemian Region', 'CZ-31': 'South Bohemian Region',
  'CZ-32': 'Plzeň Region', 'CZ-41': 'Karlovy Vary Region', 'CZ-42': 'Ústí nad Labem Region',
  'CZ-51': 'Liberec Region', 'CZ-52': 'Hradec Králové Region', 'CZ-53': 'Pardubice Region',
  'CZ-63': 'Vysočina Region', 'CZ-64': 'South Moravian Region', 'CZ-71': 'Olomouc Region',
  'CZ-72': 'Zlín Region', 'CZ-80': 'Moravian-Silesian Region',
  'EE-37': 'Harju County', 'EE-39': 'Hiiu County', 'EE-45': 'Ida-Viru County', 'EE-50': 'Jõgeva County',
  'EE-52': 'Järva County', 'EE-56': 'Lääne County', 'EE-60': 'Lääne-Viru County',
  'EE-64': 'Põlva County', 'EE-68': 'Pärnu County', 'EE-71': 'Rapla County', 'EE-74': 'Saare County',
  'EE-79': 'Tartu County', 'EE-81': 'Valga County', 'EE-84': 'Viljandi County', 'EE-87': 'Võru County',
  'PL-02': 'Lower Silesia', 'PL-04': 'Kuyavia-Pomerania', 'PL-06': 'Lublin', 'PL-08': 'Lubusz',
  'PL-10': 'Łódź', 'PL-12': 'Lesser Poland', 'PL-14': 'Masovia', 'PL-16': 'Opole',
  'PL-18': 'Subcarpathia', 'PL-20': 'Podlaskie', 'PL-22': 'Pomerania', 'PL-24': 'Silesia',
  'PL-26': 'Holy Cross', 'PL-28': 'Warmia-Masuria', 'PL-30': 'Greater Poland',
  'PL-32': 'West Pomerania',
};

/**
 * ISO 3166-2 first-level subdivisions without a Natural Earth 5.1.1 polygon (created after the
 * data or inside a disputed area). They are seeded and selectable; the map lists them under the
 * country without drawing them.
 */
export const LISTED_NOT_DRAWN = [
  { code: 'PA-10', country: 'PA', name: 'Panamá Oeste' },
  { code: 'PA-NT', country: 'PA', name: 'Naso Tjër Di' },
  { code: 'BS-GC', country: 'BS', name: 'Grand Cay' },
  { code: 'BS-HT', country: 'BS', name: 'Hope Town' },
  { code: 'CY-06', country: 'CY', name: 'Kyrenia' },
  { code: 'ME-22', country: 'ME', name: 'Gusinje' },
  { code: 'ME-23', country: 'ME', name: 'Petnjica' },
  { code: 'ME-24', country: 'ME', name: 'Tuzi' },
  { code: 'ME-25', country: 'ME', name: 'Zeta' },
  { code: 'MD-DU', country: 'MD', name: 'Dubăsari' },
];

/**
 * Subdivisions (and their country outline, for Vatican City) that collapse to nothing at the
 * output precision (0.01°, about 1 km): the build drops their empty features and checks this list,
 * so a Natural Earth update that changes it fails loudly. They stay seeded and selectable; the map
 * lists them under their country without drawing them.
 */
export const TOO_SMALL_TO_DRAW = ['MT-03', 'MT-10', 'MT-29', 'MT-41', 'VA'];

/** Clip boxes (lon/lat) per region: drops antimeridian slivers and far-off outliers. */
export const REGION_BBOX = {
  'americas-north': [-179.99, 5, -52, 84],
  'americas-south': [-92.5, -56.5, -26, 13.5],
  europe: [-32, 27, 45, 72],
};

// --- lookup tables ----------------------------------------------------------------------------

const DO_PROVINCE_REGION = {
  '01': '40', '02': '41', '03': '38', '04': '38', '05': '34', '06': '33', '07': '37', '08': '42',
  '09': '35', 10: '38', 11: '42', 12: '42', 13: '36', 14: '33', 15: '34', 16: '38', 17: '41',
  18: '35', 19: '33', 20: '33', 21: '41', 22: '37', 23: '39', 24: '36', 25: '35', 26: '34',
  27: '34', 28: '36', 29: '39', 30: '39', 31: '41', 32: '40',
};

const IE_COUNTY_PROVINCE = {
  CE: 'M', CN: 'U', CO: 'M', CW: 'L', D: 'L', DL: 'U', G: 'C', KE: 'L', KK: 'L', KY: 'M', LD: 'L',
  LH: 'L', LK: 'M', LM: 'C', LS: 'L', MH: 'L', MN: 'U', MO: 'C', OY: 'L', RN: 'C', SO: 'C', TA: 'M',
  WD: 'M', WH: 'L', WW: 'L', WX: 'L',
};

/** The ten cantons of the Federation of Bosnia and Herzegovina, as named by Natural Earth. */
const FEDERATION_CANTONS = new Set([
  'Una-Sana', 'Posavina', 'Tuzla', 'Zenica-Doboj', 'Bosnian Podrinje', 'Central Bosnia',
  'Herzegovina-Neretva', 'West Herzegovina', 'Sarajevo', 'West Bosnia',
]);

function prefixMap(country, table) {
  return Object.fromEntries(
    Object.entries(table).map(([from, to]) => [`${country}-${from}`, `${country}-${to}`]),
  );
}
