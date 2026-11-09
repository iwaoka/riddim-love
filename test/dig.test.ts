import { describe, expect, it } from 'vitest';
import { DIG_PROVIDERS, digProvidersFor, normalizeCountry, REGIONS, type DigProvider } from '../shared/dig';
import { searchText } from '../shared/format';

const ids = (country: string | null) => digProvidersFor(country).map((p) => p.id);
const q = searchText([{ id: 263, name: 'Wayne Smith', url: null }], 'Under Mi Sleng Teng');

describe('digProvidersFor (by country)', () => {
  it('JP: Discogs, eBay, Mercari, Yahoo! Auctions, Record City', () => {
    expect(ids('JP')).toEqual(['discogs', 'ebay', 'mercari', 'yahoo-auctions', 'recordcity']);
  });
  it('US, GB: Discogs, eBay', () => {
    expect(ids('US')).toEqual(['discogs', 'ebay']);
    expect(ids('GB')).toEqual(['discogs', 'ebay']);
  });
  it('unknown / invalid country: Discogs, eBay', () => {
    for (const c of [null, '', 'XX', 'T1', 'JPN', '??']) expect(ids(c)).toEqual(['discogs', 'ebay']);
  });
  it('lower-case codes are accepted', () => {
    expect(ids('jp')).toEqual(['discogs', 'ebay', 'mercari', 'yahoo-auctions', 'recordcity']);
  });
  it('is pure: takes the provider list as an argument (region groups work)', () => {
    const extra: DigProvider[] = [
      ...DIG_PROVIDERS,
      { id: 'eu-shop', name: 'EU Shop', countries: [...REGIONS.EU], buildSearchUrl: (s) => `https://example.org/?q=${encodeURIComponent(s)}` },
    ];
    expect(digProvidersFor('DE', extra).map((p) => p.id)).toEqual(['discogs', 'ebay', 'eu-shop']);
    expect(digProvidersFor('JP', extra).map((p) => p.id)).not.toContain('eu-shop');
  });
});

describe('dig search URLs', () => {
  it('pass "Artist Title", URL-encoded', () => {
    const urls = Object.fromEntries(DIG_PROVIDERS.map((p) => [p.id, p.buildSearchUrl(q)]));
    expect(urls).toEqual({
      discogs: 'https://www.discogs.com/search/?q=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng',
      ebay: 'https://www.ebay.com/sch/i.html?_nkw=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng',
      mercari: 'https://jp.mercari.com/search?keyword=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng',
      'yahoo-auctions': 'https://auctions.yahoo.co.jp/search/search?p=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng',
      recordcity: 'https://www.recordcity.jp/ja/catalog?keyword=Wayne%20Smith%20Under%20Mi%20Sleng%20Teng',
    });
    expect(DIG_PROVIDERS[0].buildSearchUrl('Bounty Killer & Wayne Smith #1 / ?')).toBe('https://www.discogs.com/search/?q=Bounty%20Killer%20%26%20Wayne%20Smith%20%231%20%2F%20%3F');
  });
  it('no affiliate or tracking parameters: exactly one query parameter each', () => {
    for (const p of DIG_PROVIDERS) expect([...new URL(p.buildSearchUrl('x')).searchParams.keys()]).toHaveLength(1);
  });
});

describe('normalizeCountry', () => {
  it('accepts two-letter codes only', () => {
    expect(normalizeCountry('gb')).toBe('GB');
    expect(normalizeCountry(' JP ')).toBe('JP');
    expect(normalizeCountry('XX')).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
    expect(normalizeCountry(42)).toBeNull();
  });
});
