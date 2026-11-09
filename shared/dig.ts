// Dig: where a selector can look for a record, by the visitor's country.
// Configuration only — each provider is a plain search-results URL built in the
// browser from "Artist Title". No API calls, no scraping, no affiliate or
// tracking parameters. Add a provider (or a region) here and the Dig menu
// picks it up; nothing else needs to change.

/** ISO 3166-1 alpha-2 country code ("JP", "GB", …), or null when unknown. */
export type CountryCode = string | null;

/**
 * Named groups of countries, for providers that serve a region rather than
 * one country. Not used by any provider yet; ready for e.g. European shops.
 */
export const REGIONS = {
  EU: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
  UK: ['GB'],
  JAPAN: ['JP'],
  NORTH_AMERICA: ['US', 'CA'],
  CARIBBEAN: ['JM', 'TT', 'BB', 'BS', 'AG', 'LC', 'VC', 'GD', 'DM', 'KN'],
} as const satisfies Record<string, readonly string[]>;

export interface DigProvider {
  id: string;
  name: string;
  /** Country codes this provider is offered in; "*" = everywhere. Spread REGIONS.X for a region. */
  countries: readonly string[];
  buildSearchUrl(query: string): string;
}

/** Display order = array order. Global providers first, then local ones. */
export const DIG_PROVIDERS: readonly DigProvider[] = [
  {
    id: 'discogs',
    name: 'Discogs',
    countries: ['*'],
    buildSearchUrl: (q) => `https://www.discogs.com/search/?q=${encodeURIComponent(q)}`,
  },
  {
    id: 'ebay',
    name: 'eBay',
    countries: ['*'],
    buildSearchUrl: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  },
  {
    id: 'mercari',
    name: 'Mercari',
    countries: [...REGIONS.JAPAN],
    buildSearchUrl: (q) => `https://jp.mercari.com/search?keyword=${encodeURIComponent(q)}`,
  },
  {
    id: 'yahoo-auctions',
    name: 'Yahoo! Auctions',
    countries: [...REGIONS.JAPAN],
    buildSearchUrl: (q) => `https://auctions.yahoo.co.jp/search/search?p=${encodeURIComponent(q)}`,
  },
  {
    id: 'recordcity',
    name: 'Record City',
    countries: [...REGIONS.JAPAN],
    // Catalogue search; the site's own form also sends a session _token, which a plain GET does not need.
    buildSearchUrl: (q) => `https://www.recordcity.jp/ja/catalog?keyword=${encodeURIComponent(q)}`,
  },
  {
    // A plain web search, last: finds the shops and pressings the list above misses.
    id: 'google',
    name: 'Google',
    countries: ['*'],
    buildSearchUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
];

/** "jp" → "JP"; anything that is not a real two-letter code (XX, T1, "", null) → null. */
export function normalizeCountry(raw: unknown): CountryCode {
  if (typeof raw !== 'string') return null;
  const c = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' ? c : null;
}

/**
 * Providers to show for a country (pure; also the hook for a future manual
 * "Region: Auto / Japan / Global / UK / Europe" switch). Unknown country →
 * global providers only, so Discogs and eBay are always available.
 */
export function digProvidersFor(country: CountryCode, providers: readonly DigProvider[] = DIG_PROVIDERS): DigProvider[] {
  const c = normalizeCountry(country);
  return providers.filter((p) => p.countries.includes('*') || (c !== null && p.countries.includes(c)));
}
